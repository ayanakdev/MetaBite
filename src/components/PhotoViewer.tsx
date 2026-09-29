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

  /** Distance between the first two active touches, in screen pixels. */
  const pinchStart = useRef(0);
  const lastTap = useRef(0);

  /**
   * How far the image may drift before it would show empty space. Recomputed per
   * gesture because it depends on the current scale.
   */
  const clamp = useCallback(
    (s: number, x: number, y: number) => {
      const limitX = Math.max(0, ((width * s) - width) / 2);
      const limitY = Math.max(0, ((height * s) - height) / 2);
      return {
        x: Math.max(-limitX, Math.min(limitX, x)),
        y: Math.max(-limitY, Math.min(limitY, y)),
      };
    },
    [width, height],
  );

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2 || _e.nativeEvent.touches.length >= 2,

      onPanResponderGrant: (e) => {
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          pinchStart.current = Math.hypot(dx, dy);
        } else {
          savedScale.value = scale.value;
          savedTx.value = tx.value;
          savedTy.value = ty.value;
        }
      },

      onPanResponderMove: (e, g) => {
        const touches = e.nativeEvent.touches;

        if (touches.length >= 2) {
          // --- pinch ---
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const dist = Math.hypot(dx, dy);
          if (pinchStart.current <= 0) {
            pinchStart.current = dist;
            savedScale.value = scale.value;
            return;
          }
          const next = Math.max(
            MIN_SCALE,
            Math.min(MAX_SCALE, (savedScale.value * dist) / pinchStart.current),
          );

          // Keep the midpoint between the fingers fixed on screen, which means
          // the content under the hands does not slide out from under them.
          const midX = (touches[0].pageX + touches[1].pageX) / 2 - width / 2;
          const midY = (touches[0].pageY + touches[1].pageY) / 2 - height / 2;
          const factor = next / (savedScale.value || 1);

          scale.value = next;
          const rawX = midX - (midX - savedTx.value) * factor;
          const rawY = midY - (midY - savedTy.value) * factor;
          const c = clamp(next, rawX, rawY);
          tx.value = c.x;
          ty.value = c.y;
          return;
        }

        // --- one finger: pan, only while zoomed in ---
        if (scale.value <= 1.01) return;
        const c = clamp(scale.value, savedTx.value + g.dx, savedTy.value + g.dy);
        tx.value = c.x;
        ty.value = c.y;
      },

      onPanResponderRelease: (e, g) => {
        const moved = Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6;
        pinchStart.current = 0;

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
