import React, { useEffect } from "react";
import { View, Text } from "react-native";
import Svg, {
  Circle,
  Defs,
  ClipPath,
  G,
  Path,
} from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors } from "../theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const VB = 200;
const CX = VB / 2;
const CY = VB / 2;
const R_INNER = 84;
const R_RING = 90;
const WAVE_AMP = 7;
const WAVE_COUNT = 1.6;

interface Props {
  /** 0..1 fraction of the goal consumed. */
  progress: number;
  size?: number;
  color?: string;
  trackColor?: string;
  centerPrimary?: string;
  centerSecondary?: string;
  children?: React.ReactNode;
}

/**
 * Circular fluid tank. The surface is a sine wave whose phase is driven on the
 * UI thread by Reanimated, so the animation never round-trips through JS.
 */
export function FluidTank({
  progress,
  size = 260,
  color = colors.mint500,
  trackColor = colors.mint50,
  centerPrimary,
  centerSecondary,
  children,
}: Props) {
  const phase = useSharedValue(0);
  const fill = useSharedValue(0);

  useEffect(() => {
    phase.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 3200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [phase]);

  // Animate level changes rather than snapping, so logging a meal reads as the
  // liquid physically rising.
  useEffect(() => {
    fill.value = withTiming(Math.max(0, Math.min(1, progress)), {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, fill]);

  const waterProps = useAnimatedProps(() => {
    const levelY = CX + R_INNER - fill.value * (R_INNER * 2);
    const step = 6;
    let d = `M 0 ${levelY}`;
    for (let x = 0; x <= VB; x += step) {
      const y =
        levelY +
        Math.sin((x / VB) * Math.PI * 2 * WAVE_COUNT + phase.value) * WAVE_AMP;
      d += ` L ${x} ${y.toFixed(2)}`;
    }
    d += ` L ${VB} ${VB} L 0 ${VB} Z`;
    return { d };
  });

  // A second, slower wave behind the front one reads as depth.
  const backProps = useAnimatedProps(() => {
    const levelY = CX + R_INNER - fill.value * (R_INNER * 2);
    const step = 6;
    let d = `M 0 ${levelY}`;
    for (let x = 0; x <= VB; x += step) {
      const y =
        levelY +
        Math.sin((x / VB) * Math.PI * 2 * WAVE_COUNT - phase.value * 0.7 + 1.4) *
          (WAVE_AMP * 0.75);
      d += ` L ${x} ${y.toFixed(2)}`;
    }
    d += ` L ${VB} ${VB} L 0 ${VB} Z`;
    return { d };
  });

  const glowProps = useAnimatedProps(() => {
    const levelY = CX + R_INNER - fill.value * (R_INNER * 2);
    const step = 6;
    let d = `M 0 ${levelY}`;
    for (let x = 0; x <= VB; x += step) {
      const y =
        levelY +
        Math.sin((x / VB) * Math.PI * 2 * WAVE_COUNT + phase.value) * WAVE_AMP;
      d += ` L ${x} ${y.toFixed(2)}`;
    }
    d += ` L ${VB} ${VB} L 0 ${VB} Z`;
    return { d };
  });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
        <Defs>
          <ClipPath id="tankClip">
            <Circle cx={CX} cy={CY} r={R_INNER} />
          </ClipPath>
        </Defs>

        <Circle cx={CX} cy={CY} r={R_INNER} fill={trackColor} />

        <G clipPath="url(#tankClip)">
          <AnimatedPath animatedProps={backProps} fill={color} opacity={0.32} />
          <AnimatedPath animatedProps={waterProps} fill={color} />
          <AnimatedPath animatedProps={glowProps} fill="#FFFFFF" opacity={0.14} />
        </G>

        <Circle
          cx={CX}
          cy={CY}
          r={R_RING}
          fill="none"
          stroke={color}
          strokeWidth={3}
          opacity={0.28}
        />
      </Svg>

      <View
        pointerEvents="none"
        style={{ position: "absolute", alignItems: "center", justifyContent: "center" }}
      >
        {centerPrimary ? (
          <Text
            style={{
              fontSize: size * 0.115,
              fontWeight: "800",
              color: colors.ink,
              letterSpacing: -0.5,
            }}
          >
            {centerPrimary}
          </Text>
        ) : null}
        {centerSecondary ? (
          <Text
            style={{
              marginTop: 4,
              fontSize: size * 0.052,
              fontWeight: "600",
              color: colors.muted,
            }}
          >
            {centerSecondary}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  );
}

/** Compact variant for the protein / carb mini tanks. */
export function MiniTank({
  progress,
  size = 108,
  color = colors.mint500,
  value,
  label,
}: {
  progress: number;
  size?: number;
  color?: string;
  value: string;
  label: string;
}) {
  return (
    <FluidTank
      progress={progress}
      size={size}
      color={color}
      trackColor="#F3F4F6"
      centerPrimary={value}
      centerSecondary={label}
    />
  );
}
