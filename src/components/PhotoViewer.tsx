import React, { useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Image,
  PanResponder,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

/**
 * Full-screen photo viewer with two-finger pinch zoom.
 *
 * react-native-gesture-handler is not a dependency, and adding a native module
 * for one screen would cost a rebuild and a new native surface. PanResponder is
 * part of React Native itself and reports every touch in
 * `nativeEvent.touches`, so the distance between the first two fingers is
 * available directly - that is the whole of pinch, and it can be driven from
 * here with Reanimated shared values so the image tracks the fingers instead of
 * snapping between frames.
 *
 * Scaling is around the midpoint between the fingers, so the spot being
 * inspected stays under the user's hands rather than drifting to the centre.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 280;

export function PhotoViewer({
  uri,
  onClose,
}: {
  uri: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  /** Pinch anchor, captured when the second finger lands. */
  const pinchDist0 = useRef(0);
  const pinchMid0X = useRef(0);
  const pinchMid0Y = useRef(0);
  /** Previous single-finger position, so panning is incremental. */
  const lastX = useRef(0);
  const lastY = useRef(0);
  const lastTap = useRef(0);

  /**
   * Touch position in this view's own coordinates, measured from its centre.
   *
   * Working centre-relative is what makes the pinch algebra work out: the
   * transform list is [translate, scale], so a content point at offset u from
   * the centre lands at `translate + scale * u`. Solving for the translation
   * that keeps a chosen point under the fingers is then a two-line operation
   * instead of a bookkeeping exercise in full-screen coordinates.
   */
  const centreOf = useCallback(
    (t: any) => {
      const x = typeof t?.locationX === "number" ? t.locationX : t?.pageX ?? 0;
      const y = typeof t?.locationY === "number" ? t.locationY : t?.pageY ?? 0;
      return { x: x - width / 2, y: y - height / 2 };
    },
    [width, height],
  );

  /**
   * How far the image may drift before it would show empty space. Recomputed per
   * gesture because it depends on the current scale.
   */
  const clamp = useCallback(
    (s: number, x: number, y: number) => {
      const limitX = Math.max(0, (width * s - width) / 2);
      const limitY = Math.max(0, (height * s - height) / 2);
      return {
        x: Math.max(-limitX, Math.min(limitX, x)),
        y: Math.max(-limitY, Math.min(limitY, y)),
      };
    },
    [width, height],
  );

  /** Re-anchor the pinch to the fingers as they are right now. */
  const beginPinch = useCallback(
    (touches: any[]) => {
      const a = centreOf(touches[0]);
      const b = centreOf(touches[1]);
      pinchDist0.current = Math.hypot(a.x - b.x, a.y - b.y);
      pinchMid0X.current = (a.x + b.x) / 2;
      pinchMid0Y.current = (a.y + b.y) / 2;
      savedScale.value = scale.value;
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    },
    // Reanimated shared values are stable refs, so centreOf is the only
    // dependency that can actually change between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [centreOf],
  );

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2 || _e.nativeEvent.touches.length >= 2,

      onPanResponderGrant: (e) => {
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          beginPinch(touches);
        } else if (touches.length === 1) {
          const p = centreOf(touches[0]);
          lastX.current = p.x;
          lastY.current = p.y;
          savedScale.value = scale.value;
          savedTx.value = tx.value;
          savedTy.value = ty.value;
        }
      },

      onPanResponderMove: (e) => {
        const touches = e.nativeEvent.touches;

        if (touches.length >= 2) {
          // A second finger can land mid-drag, so the anchor may not exist yet.
          if (pinchDist0.current <= 0) {
            beginPinch(touches);
            return;
          }

          const a = centreOf(touches[0]);
          const b = centreOf(touches[1]);
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const midNowX = (a.x + b.x) / 2;
          const midNowY = (a.y + b.y) / 2;

          const base = savedScale.value || 1;
          const next = Math.max(
            MIN_SCALE,
            Math.min(MAX_SCALE, (base * dist) / pinchDist0.current),
          );

          // The content point that sat under the fingers when the pinch began
          // must still sit under them now.
          const contentX = (pinchMid0X.current - savedTx.value) / base;
          const contentY = (pinchMid0Y.current - savedTy.value) / base;

          scale.value = next;
          const c = clamp(
            next,
            midNowX - next * contentX,
            midNowY - next * contentY,
          );
          tx.value = c.x;
          ty.value = c.y;
          return;
        }

        if (touches.length === 1) {
          // Incremental rather than using the gesture's total dx/dy, so lifting
          // or adding a second finger does not make the image jump.
          const p = centreOf(touches[0]);
          const dx = p.x - lastX.current;
          const dy = p.y - lastY.current;
          lastX.current = p.x;
          lastY.current = p.y;

          if (scale.value <= 1.01) return;
          const c = clamp(scale.value, tx.value + dx, ty.value + dy);
          tx.value = c.x;
          ty.value = c.y;
        }
      },

      onPanResponderRelease: (e, g) => {
        const moved = Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6;
        pinchDist0.current = 0;

        // A tap that did not drag: double-tap toggles between fit and 2.5x,
        // and a single tap is left to the close button rather than being a
        // second, easily-mistaken way to dismiss.
        if (!moved && e.nativeEvent.touches.length === 0) {
          const now = Date.now();
          if (now - lastTap.current < DOUBLE_TAP_MS) {
            lastTap.current = 0;
            const zooming = scale.value > 1.01;
            scale.value = withSpring(zooming ? MIN_SCALE : 2.5);
            tx.value = withSpring(0);
            ty.value = withSpring(0);
          } else {
            lastTap.current = now;
          }
        }

        // Settle back inside the bounds rather than sticking out of frame.
        const c = clamp(scale.value, tx.value, ty.value);
        tx.value = withSpring(c.x);
        ty.value = withSpring(c.y);
      },
    }),
  ).current;

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <View className="flex-1 bg-black">
      <Animated.View
        style={[{ flex: 1, alignItems: "center", justifyContent: "center" }, style]}
        {...pan.panHandlers}
      >
        <Image
          source={{ uri }}
          style={{ width, height }}
          resizeMode="contain"
          accessibilityLabel="Meal photo"
        />
      </Animated.View>

      <Pressable
        onPress={onClose}
        hitSlop={12}
        className="absolute h-11 w-11 items-center justify-center rounded-full active:opacity-70"
        style={{ top: insets.top + 10, right: 16, backgroundColor: "rgba(0,0,0,0.5)" }}
      >
        <Ionicons name="close" size={24} color="#FFFFFF" />
      </Pressable>

      <View
        className="absolute bottom-0 left-0 right-0 items-center"
        style={{ paddingBottom: insets.bottom + 22 }}
        pointerEvents="none"
      >
        <Text className="text-[11px] font-semibold text-white/60">
          Pinch to zoom · double-tap to toggle
        </Text>
      </View>
    </View>
  );
}

/** Small tappable thumbnail that opens the viewer. */
export function PhotoThumb({
  uri,
  size = 64,
  onPress,
}: {
  uri: string;
  size?: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="active:opacity-75">
      <View
        style={{ width: size, height: size }}
        className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#F3F4F6]"
      >
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          accessibilityLabel="Meal photo"
        />
      </View>
    </Pressable>
  );
}

/** Placeholder shown while a signed URL is being fetched. */
export function PhotoPlaceholder({ size = 64 }: { size?: number }) {
  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center rounded-2xl bg-[#F3F4F6]"
    >
      <ActivityIndicator size="small" color={colors.muted} />
    </View>
  );
}
