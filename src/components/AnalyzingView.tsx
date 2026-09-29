import React, { useEffect } from "react";
import { Image, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../theme";

/**
 * The processing page shown after the user commits to a scan.
 *
 * This replaced a spinner drawn on top of the live camera. Three things were
 * wrong with that: the viewfinder stayed visible so the screen never looked like
 * it had changed state, the user could still see (and think about) the framing
 * they had just corrected, and a bare spinner says only "wait" without saying how
 * long or what is happening.
 *
 * Here the camera is gone, the photo being worked on is on screen, and the copy
 * advances through the pipeline's real stages so the wait is legible.
 */

export interface AnalysisStep {
  title: string;
  sub: string;
}

export const ANALYSIS_STEPS: AnalysisStep[] = [
  { title: "Reading your plate", sub: "Identifying everything on it" },
  { title: "Estimating portions", sub: "Weighing each item from your photo" },
  { title: "Cross-checking", sub: "Comparing against real food databases" },
  { title: "Adding it up", sub: "Finishing your numbers" },
];

const FRAME = 208;

export function AnalyzingView({
  stage,
  photoUri,
}: {
  /** Index into ANALYSIS_STEPS. */
  stage: number;
  photoUri?: string | null;
}) {
  const sweep = useSharedValue(0);

  useEffect(() => {
    // Reverse ping-pong, not a hard reset. With reverse disabled the line jumps
    // from the bottom of the frame back to the top every cycle, and that snap is
    // exactly the kind of thing that reads as cheap. The animation is a
    // worklet on a shared value, so it runs on the UI thread and never touches
    // the JS thread per frame.
    sweep.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -FRAME / 2 + sweep.value * FRAME }],
  }));

  const active = ANALYSIS_STEPS[Math.max(0, Math.min(stage, ANALYSIS_STEPS.length - 1))];
  const done = Math.max(0, Math.min(stage, ANALYSIS_STEPS.length - 1));

  return (
    <View className="flex-1 bg-white">
      {/* Same soft mint blooms as the splash, so the hand-off from launch to a
          scan reads as one continuous brand surface. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -260,
          left: -300,
          width: 720,
          height: 720,
          borderRadius: 360,
          backgroundColor: "#C9F3DC",
          opacity: 0.55,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: -300,
          right: -320,
          width: 780,
          height: 780,
          borderRadius: 390,
          backgroundColor: "#D2F5E2",
          opacity: 0.5,
        }}
      />

      <View className="flex-1 items-center justify-center px-8">
        {/* the frame being worked on, with a scan line sweeping it */}
        <View
          className="items-center justify-center overflow-hidden rounded-[32px] bg-[#0A0A0F]"
          style={{ width: FRAME, height: FRAME }}
        >
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={{ width: FRAME, height: FRAME }}
              resizeMode="cover"
            />
          ) : null}

          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left: 0,
                right: 0,
                height: 64,
                backgroundColor: "rgba(0,200,83,0.16)",
                borderTopWidth: 2,
                borderBottomWidth: 2,
                borderColor: "rgba(0,200,83,0.55)",
              },
              sweepStyle,
            ]}
          />
        </View>

        <Text className="mt-10 text-center text-2xl font-extrabold text-[#0A0A0F]">
          {active.title}
        </Text>
        <Text className="mt-2 text-center text-sm leading-5 text-[#6B7280]">
          {active.sub}
        </Text>

        {/* stage rail */}
        <View className="mt-9 flex-row items-center gap-2">
          {ANALYSIS_STEPS.map((s, i) => (
            <View
              key={s.title}
              style={{
                height: 5,
                width: i === done ? 34 : 22,
                borderRadius: 3,
                backgroundColor: i <= done ? colors.mint500 : "#E5E7EB",
              }}
            />
          ))}
        </View>
      </View>

      <View className="items-center pb-16">
        <Text className="text-[11px] font-semibold uppercase tracking-[2px] text-[#9CA3AF]">
          MetaBite
        </Text>
      </View>
    </View>
  );
}
