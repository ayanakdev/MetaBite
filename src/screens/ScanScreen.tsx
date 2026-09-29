import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Camera, CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { AnalyzingView, ANALYSIS_STEPS } from "../components/AnalyzingView";
import { isQuotaError, quotaMessage } from "../lib/quota";
import { prepareShot, pickPictureSize, type Shot } from "../lib/imagePrep";
import { runAnalysis } from "../lib/analyze";
import type { ParsedMeal } from "../lib/types";
import { colors } from "../theme";

/** 0 = top-down shot, 1 = side shot, 2 = committed, ready to analyse. */
type Step = 0 | 1 | 2;

/**
 * How long the analysis page stays up even if the result is ready sooner.
 *
 * Without this a cache hit renders in a few dozen milliseconds and the page
 * flashes once before vanishing, which reads as a glitch rather than as progress.
 */
const MIN_ANALYSIS_MS = 850;

/** Interval for the slow auto-advance of the analysis copy. */
const STAGE_TICK_MS = 2200;

/**
 * Zoom level for the double-tap toggle, as a fraction of the device's maximum.
 * Half of max is a noticeable step that still leaves enough frame around a plate
 * to keep the reference object in shot.
 */
const ZOOM_TIGHT = 0.5;

export function ScanScreen({
  onResult,
  onCancel,
}: {
  onResult: (m: ParsedMeal) => void;
  onCancel: () => void;
}) {
  const [perm] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);

  /** null = chooser, 1 = top-down only, 2 = top-down + side */
  const [mode, setMode] = useState<1 | 2 | null>(null);
  const [step, setStep] = useState<Step>(0);
  const [top, setTop] = useState<Shot | null>(null);
  const [side, setSide] = useState<Shot | null>(null);
  const [quickSpecs, setQuickSpecs] = useState("");

  /** Downscaling a 12 MP frame on the way in; brief but not instant. */
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const lastTap = useRef(0);

  /**
   * Double-tap toggles between the full frame and a tighter one.
   *
   * expo-camera 57 exposes no tap-to-focus: there is no `focus` prop, no
   * `focus()` method, and the Android view hardcodes its metering point to the
   * top-left corner with no entry point for anything else. Rather than draw a
   * reticle that implies a focus lock which never happens, the tap does the one
   * camera adjustment this SDK can genuinely perform - the `zoom` prop, which
   * the native layer maps onto CameraX's setZoomRatio.
   *
   * It is a real feature for this app rather than a camera toy: a phone held far
   * enough back that the plate is small in frame is the most common cause of a
   * poor portion read, and a tighter crop fixes it.
   *
   * No zoom readout is drawn, because the module exposes no maximum zoom ratio,
   * so any "2x" label could overstate what the device actually applied. The
   * honest feedback is the image itself getting bigger.
   */
  const onCameraTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 320) {
      setZoomLevel((z) => (z === 0 ? ZOOM_TIGHT : 0));
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  }, []);

  const HINTS = [
    "Fit the WHOLE plate in frame. No need to squeeze it into a box.",
    "Now a side view, level with the bowl, to read how full it is.",
  ];

  /**
   * Ask the camera for a ~1.3 MP capture instead of its 12 MP default, once, as
   * soon as the preview mounts.
   *
   * This is the biggest single lever on how long a scan takes. The full-res
   * encode costs hundreds of milliseconds of phone CPU before a single byte is
   * sent, and the extra pixels are discarded anyway - the model reads the image
   * at 768 px internally. Resolving it here, before the first shutter press,
   * means the setting is never changed under a live preview mid-session.
   */
  useEffect(() => {
    if (mode === null) return;
    let cancelled = false;
    (async () => {
      try {
        const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
        if (cancelled) return;
        const picked = pickPictureSize(sizes);
        if (picked) setPictureSize(picked);
      } catch {
        // Keep the camera's own default if the device will not report sizes.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  /**
   * Requested when a mode is chosen, not when the shutter is pressed, so the
   * system prompt appears before the camera interface rather than in the middle
   * of it. Android only shows it once; after a denial `canAskAgain` goes false
   * and we send the user to Settings instead of silently failing.
   */
  async function askPermissionAndEnter(next: 1 | 2) {
    if (perm?.granted) {
      setMode(next);
      return;
    }

    const res = await Camera.requestCameraPermissionsAsync();
    if (res.granted) {
      setMode(next);
      return;
    }

    Alert.alert(
      res.canAskAgain ? "Camera permission needed" : "Camera blocked",
      res.canAskAgain
        ? "MetaBite needs the camera to photograph your meal."
        : "Camera access is turned off for MetaBite. Open Settings > Apps > MetaBite > Permissions and enable Camera.",
      res.canAskAgain
        ? [
            { text: "Cancel", style: "cancel" },
            { text: "Allow", onPress: () => setMode(next) },
          ]
        : [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
    );
  }

  async function ensureCamera() {
    if (perm?.granted) return true;
    const res = await Camera.requestCameraPermissionsAsync();
    return !!res.granted;
  }

  /** Prepare a freshly captured frame, or fail loudly rather than scan nothing. */
  async function finishShot(
    prepared: Shot,
    slot: 0 | 1,
  ): Promise<void> {
    if (!prepared.base64) {
      throw new Error("That photo could not be processed. Try taking it again.");
    }
    if (slot === 0) {
      setTop(prepared);
      // One-photo mode has no second frame to wait for, so the shot is
      // immediately ready to confirm.
      setStep(mode === 1 ? 2 : 1);
    } else {
      setSide(prepared);
      setStep(2);
    }
  }

  async function capture() {
    const ok = await ensureCamera();
    if (!ok) {
      Alert.alert("Camera blocked", "Grant camera access, or pick from your library.");
      return;
    }
    try {
      setPreparing(true);
      // skipProcessing is deliberately left off. With it on, expo-camera writes
      // the raw buffer and leaves the rotation in EXIF, and ImageManipulator
      // does not read EXIF - so the downscaled frame would come out sideways.
      // Baking the rotation into the pixels costs one decode of a 1.3 MP frame
      // now that the capture size is capped, and removes the whole question.
      const shot = await cameraRef.current?.takePictureAsync({
        quality: 1,
        base64: true,
      });
      if (!shot) return;
      await finishShot(
        await prepareShot({
          uri: shot.uri,
          base64: shot.base64,
          width: shot.width,
          height: shot.height,
          mimeType: "image/jpeg",
        }),
        step === 0 ? 0 : 1,
      );
    } catch (e) {
      Alert.alert("Capture failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setPreparing(false);
      // The photo is already taken; leaving the torch on just drains the battery
      // and lights up the user's face while they frame the next shot.
      setTorchOn(false);
    }
  }

  async function fromLibrary(slot: 0 | 1) {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] });
    const asset = res.assets?.[0];
    if (res.canceled || !asset) return;
    try {
      setPreparing(true);
      // No base64 is requested from the picker: a full-resolution one would be
      // megabytes of string built only to be thrown away by the downscale.
      await finishShot(
        await prepareShot({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          mimeType: asset.mimeType,
        }),
        slot,
      );
    } catch (e) {
      Alert.alert("Could not use that photo", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setPreparing(false);
    }
  }

  /** Skip the side shot - still works, just less precise. */
  function skipSide() {
    setSide(null);
    setStep(2);
  }

  /** Discard everything and start the capture sequence over. */
  function retake() {
    setTop(null);
    setSide(null);
    setStep(0);
    setZoomLevel(0);
  }

  /** From the confirmation screen, go back to the viewfinder without discarding. */
  function backToCamera() {
    setStep(mode === 1 ? 0 : 1);
  }

  const STAGE_INDEX: Record<string, number> = {
    identify: 1,
    crosscheck: 2,
    finalise: 3,
  };

  const startAnalysis = useCallback(async () => {
    if (!top) return;
    const startedAt = Date.now();
    setBusy(true);
    setStage(0);

    // Two independent things move the copy forward: the pipeline reports the
    // boundaries of real work, and this tick keeps a slow connection from
    // looking frozen. Whichever gets further first wins, because every update
    // only ever raises the stage.
    const tick = setInterval(() => {
      setStage((s) => (s < ANALYSIS_STEPS.length - 1 ? s + 1 : s));
    }, STAGE_TICK_MS);

    try {
      const { meal } = await runAnalysis({
        top,
        side,
        quickSpecs,
        onStage: (key) => {
          const next = STAGE_INDEX[key] ?? 0;
          setStage((s) => Math.max(s, next));
        },
      });

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_ANALYSIS_MS) {
        await new Promise((r) => setTimeout(r, MIN_ANALYSIS_MS - elapsed));
      }
      onResult(meal);
    } catch (e) {
      if (isQuotaError(e)) {
        Alert.alert("Free scans used up", quotaMessage(e.quota, e.quota.model ?? "Gemini"));
      } else {
        Alert.alert(
          "Could not read that meal",
          e instanceof Error ? e.message : "Unknown error",
        );
      }
    } finally {
      clearInterval(tick);
      setBusy(false);
    }
  }, [top, side, quickSpecs, onResult]);

  /* ----------------------------------------------------------------- pages */

  if (!perm) return <View className="flex-1 bg-[#0A0A0F]" />;

  if (!mode) {
    return (
      <View className="flex-1 bg-white" style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          onPress={onCancel}
          hitSlop={12}
          className="absolute left-5"
          style={{ top: insets.top + 16 }}
        >
          <Text className="text-base font-semibold text-[#6B7280]">Cancel</Text>
        </Pressable>

        <View className="flex-1 justify-center px-6">
          <Text className="text-2xl font-extrabold text-[#0A0A0F]">
            How many photos?
          </Text>
          <Text className="mt-1 text-sm text-[#6B7280]">
            More angles mean a more accurate portion estimate.
          </Text>

          <Pressable
            onPress={() => askPermissionAndEnter(1)}
            className="mt-8 rounded-3xl border-2 border-[#0A4A24] px-5 py-5 active:opacity-80"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-extrabold text-[#0A4A24]">
                1 photo - faster
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.jade500} />
            </View>
            <Text className="mt-1.5 text-sm leading-5 text-[#6B7280]">
              One top-down shot. Quick, but a half-full bowl and a full bowl look
              the same from above, so expect a rougher estimate.
            </Text>
          </Pressable>

          <Pressable
            onPress={() => askPermissionAndEnter(2)}
            className="mt-4 rounded-3xl border-2 border-[#00C853] bg-[#E8FBF0] px-5 py-5 active:opacity-80"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-extrabold text-[#0A4A24]">
                2 photos - more accurate
              </Text>
              <View className="rounded-full bg-[#00C853] px-2 py-0.5">
                <Text className="text-[10px] font-extrabold text-white">
                  RECOMMENDED
                </Text>
              </View>
            </View>
            <Text className="mt-1.5 text-sm leading-5 text-[#0A4A24]">
              Top-down, then a side view level with the bowl. The side view
              reveals how full the container is, which is what makes the weight
              estimate trustworthy.
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /* ---- analysing: its own page, not an overlay on a live viewfinder ---- */
  if (busy) {
    return <AnalyzingView stage={stage} photoUri={top?.uri} />;
  }

  /* ---- confirmation ---- */
  if (step === 2) {
    return (
      <View className="flex-1 bg-white">
        <View
          className="flex-row items-center border-b border-[#E5E7EB] px-4"
          style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}
        >
          <Pressable onPress={backToCamera} hitSlop={12} className="flex-row items-center">
            <Ionicons name="chevron-back" size={22} color={colors.jade500} />
            <Text className="ml-0.5 text-base font-semibold text-[#0A4A24]">
              Camera
            </Text>
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center px-8">
          {side ? (
            <View className="flex-row gap-4">
              <ShotThumb shot={top!} label="TOP" size={140} />
              <ShotThumb shot={side} label="SIDE" size={140} />
            </View>
          ) : (
            <ShotThumb shot={top!} label="TOP" size={208} />
          )}

          <Text className="mt-8 text-center text-2xl font-extrabold text-[#0A0A0F]">
            Ready to scan?
          </Text>
          <Text className="mt-2 text-center text-sm leading-5 text-[#6B7280]">
            Check the whole plate is in frame and that a coin, card or thumb sits
            beside the food - that is what turns the photo into a real weight.
          </Text>

          {side ? null : (
            <View className="mt-4 rounded-full bg-[#F3F4F6] px-3 py-1">
              <Text className="text-[11px] font-semibold text-[#6B7280]">
                No side view - add one from Camera for a tighter estimate
              </Text>
            </View>
          )}
        </View>

        <View
          className="flex-row gap-3 px-6"
          style={{ paddingBottom: insets.bottom + 20 }}
        >
          <Pressable
            onPress={retake}
            className="h-14 flex-1 items-center justify-center rounded-2xl border-2 border-[#E5E7EB] active:opacity-70"
          >
            <Text className="text-base font-extrabold text-[#0A0A0F]">Retake</Text>
          </Pressable>
          <Pressable
            onPress={startAnalysis}
            className="h-14 flex-[1.4] items-center justify-center rounded-2xl bg-[#0A4A24] active:opacity-80"
          >
            <Text className="text-base font-extrabold text-white">Scan meal</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /* ---- live camera ---- */
  const stepLabels = mode === 1 ? ["Top-down", "Result"] : ["Top-down", "Side", "Result"];
  const activeStep = mode === 1 ? (step === 0 ? 0 : 1) : step;

  return (
    <View className="flex-1 bg-[#0A0A0F]">
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="back"
        flash={torchOn ? "on" : "off"}
        enableTorch={torchOn}
        autofocus="on"
        zoom={zoomLevel}
        pictureSize={pictureSize}
        animateShutter={false}
        onTouchEnd={onCameraTap}
      />

      {/* framing guide - deliberately open. This is NOT a crop box; the capture
          always takes the full camera frame. Corner brackets just suggest where
          the food should sit, so a large plate never feels like it has to be
          squeezed into a small square. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View className="flex-[3]" />
        <View className="h-[46%] w-[86%] self-center">
          <Bracket className="absolute left-0 top-0" corner="tl" />
          <Bracket className="absolute right-0 top-0" corner="tr" />
          <Bracket className="absolute bottom-0 left-0" corner="bl" />
          <Bracket className="absolute bottom-0 right-0" corner="br" />
        </View>
        <View className="flex-[3]" />
      </View>

      {/* step indicator + hint */}
      <View
        pointerEvents="none"
        className="absolute left-0 right-0 items-center gap-2 px-6"
        style={{ top: insets.top + 16 }}
      >
        <View className="flex-row items-center gap-2">
          {stepLabels.map((label, i) => (
            <View key={label} className="flex-row items-center gap-2">
              <View
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: i <= activeStep ? colors.mint500 : "rgba(255,255,255,0.35)" }}
              />
              <Text
                className="text-[11px] font-bold"
                style={{ color: i <= activeStep ? colors.mint500 : "rgba(255,255,255,0.6)" }}
              >
                {label}
              </Text>
              {i < stepLabels.length - 1 ? <View className="h-px w-5 bg-white/25" /> : null}
            </View>
          ))}
        </View>
        <View className="rounded-2xl bg-black/60 px-4 py-2">
          <Text className="text-center text-xs font-semibold text-white/90">
            {HINTS[Math.min(step, 1)]}
          </Text>
          {step === 0 ? (
            <Text className="mt-1 text-center text-[11px] font-medium text-[#6FE3A0]">
              Put a thumb, coin or card BESIDE the food (not in it) - it becomes
              a ruler we use for real weights. Double-tap to zoom in.
            </Text>
          ) : null}
        </View>
      </View>

      <Pressable
        onPress={() => setTorchOn((v) => !v)}
        className="absolute h-11 w-11 items-center justify-center rounded-full active:opacity-70"
        style={{
          right: 20,
          top: insets.top + (step === 0 ? 132 : 52),
          backgroundColor: torchOn ? colors.mint500 : "rgba(0,0,0,0.45)",
        }}
      >
        <Ionicons
          name={torchOn ? "flashlight" : "flashlight-outline"}
          size={20}
          color={torchOn ? "#0A0A0F" : "#FFFFFF"}
        />
      </Pressable>

      {/* captured thumbnails */}
      {top ? (
        <View className="absolute left-5 flex-row gap-2" style={{ top: insets.top + 96 }}>
          <ShotThumb shot={top} label="TOP" size={56} />
          {side ? <ShotThumb shot={side} label="SIDE" size={56} /> : null}
        </View>
      ) : null}

      {/* quick specs */}
      <View className="absolute left-0 right-0 px-5" style={{ bottom: insets.bottom + 150 }}>
        <TextInput
          value={quickSpecs}
          onChangeText={setQuickSpecs}
          placeholder='Optional: "this is a diet coke", "half the plate"'
          placeholderTextColor="#9CA3AF"
          className="rounded-2xl border border-white/15 bg-white/95 px-4 py-3.5 text-sm text-[#0A0A0F]"
        />
      </View>

      {/* controls */}
      <View
        className="absolute left-0 right-0 flex-row items-center justify-between px-10"
        style={{ bottom: insets.bottom + 40, paddingBottom: 8 }}
      >
        <Pressable
          onPress={() => fromLibrary(step === 0 ? 0 : 1)}
          className="h-14 w-14 items-center justify-center rounded-full bg-white/15 active:opacity-70"
        >
          <Text className="text-[11px] font-bold text-white">Library</Text>
        </Pressable>

        <Pressable
          onPress={capture}
          disabled={preparing}
          className="h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/25 active:opacity-80"
        >
          {preparing ? (
            <ActivityIndicator color="#FFFFFF" size="large" />
          ) : (
            <View className="h-14 w-14 rounded-full bg-white" />
          )}
        </Pressable>

        {step === 1 && mode === 2 ? (
          <Pressable
            onPress={skipSide}
            disabled={preparing}
            className="h-14 w-14 items-center justify-center rounded-full bg-white/15 active:opacity-70"
          >
            <Text className="text-[10px] font-bold text-white">Skip</Text>
          </Pressable>
        ) : top ? (
          <Pressable onPress={retake} className="h-14 w-14 items-center justify-center">
            <Text className="text-[10px] font-bold text-white/70">Retake</Text>
          </Pressable>
        ) : (
          <View className="h-14 w-14" />
        )}
      </View>

      {preparing ? (
        <View
          className="absolute inset-0 items-center justify-center bg-black/50"
          pointerEvents="none"
        >
          <Text className="text-sm font-semibold text-white">Preparing photo</Text>
        </View>
      ) : null}
    </View>
  );
}

function ShotThumb({
  shot,
  label,
  size,
}: {
  shot: Shot;
  label: string;
  size: number;
}) {
  return (
    <View
      className="overflow-hidden rounded-2xl border-2 border-white/80"
      style={{ width: size, height: size }}
    >
      <Image source={{ uri: shot.uri }} style={{ width: size, height: size }} resizeMode="cover" />
      <View className="absolute bottom-0 left-0 right-0 bg-black/50 py-0.5">
        <Text className="text-center text-[8px] font-bold text-white">{label}</Text>
      </View>
    </View>
  );
}

/** One L-shaped corner of the framing guide. */
function Bracket({
  corner,
  className,
}: {
  corner: "tl" | "tr" | "bl" | "br";
  className?: string;
}) {
  const w = 34;
  const h = 34;
  const t = 5;
  const isTop = corner === "tl" || corner === "tr";
  const isLeft = corner === "tl" || corner === "bl";

  return (
    <View className={className} style={{ width: w, height: h }}>
      <View
        style={{
          position: "absolute",
          top: isTop ? 0 : undefined,
          bottom: isTop ? undefined : 0,
          left: 0,
          width: isLeft ? t : undefined,
          right: isLeft ? undefined : 0,
          height: t,
          borderRadius: 3,
          backgroundColor: colors.mint500,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: isTop ? 0 : undefined,
          bottom: isTop ? undefined : 0,
          left: isLeft ? 0 : undefined,
          right: isLeft ? undefined : 0,
          width: t,
          height: isLeft ? h : undefined,
          borderRadius: 3,
          backgroundColor: colors.mint500,
        }}
      />
    </View>
  );
}
