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

const logo = require("../../assets/splash-icon.png");

/**
 * Branded loading screen shown while the Supabase session and profile load.
 *
 * The native splash cannot animate, so the static image covers launch; this
 * takes over immediately after with the same composition plus a live spinner,
 * so the handoff between the two does not look like two different apps.
 */
export function BrandSplash({ message }: { message?: string }) {
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1, false);
  }, [spin]);

  const ring = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  return (
    <View className="flex-1 bg-white">
      {/* soft mint blooms, matching the splash artwork */}
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

      <View className="flex-1 items-center justify-center">
        <Image
          source={logo}
          style={{ width: 168, height: 168 }}
          resizeMode="contain"
        />

        <Text
          style={{
            marginTop: 18,
            fontSize: 42,
            fontWeight: "800",
            letterSpacing: -0.6,
            color: "#101418",
          }}
        >
          Meta<Text style={{ color: "#22C55E" }}>Bite</Text>
        </Text>

        <Text
          style={{
            marginTop: 8,
            fontSize: 12,
            fontWeight: "600",
            letterSpacing: 3.2,
            color: "#5B6470",
          }}
        >
          SCAN<Text style={{ color: "#22C55E" }}>  •  </Text>TRACK
          <Text style={{ color: "#22C55E" }}>  •  </Text>LIVE BETTER
        </Text>

        <Animated.View
          style={[
            {
              marginTop: 44,
              width: 42,
              height: 42,
              borderRadius: 21,
              borderWidth: 3.5,
              borderColor: "#D6F5E4",
              borderTopColor: colors.mint500,
              borderRightColor: colors.mint500,
            },
            ring,
          ]}
        />

        {message ? (
          <Text
            style={{
              marginTop: 20,
              fontSize: 12,
              fontWeight: "600",
              color: "#8A929C",
            }}
          >
            {message}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
