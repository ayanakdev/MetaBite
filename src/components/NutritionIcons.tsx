import React from "react";
import { View } from "react-native";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";

/**
 * Tiny hand-drawn-style food/gym glyphs for the nutrition breakdown cards.
 * Sized and coloured by the caller so the same set works at any scale.
 */

export function ProteinIcon({ size = 26, color = "#0A4A24" }: { size?: number; color?: string }) {
  // A drumstick: meat lobe + bone.
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Path
        d="M20.5 5.5c4.2 0 7 2.9 7 6.9 0 3.4-2.2 5.6-4.6 6.4l-3.6 4.2a3 3 0 0 1-2.3 1H8.2a2 2 0 0 1-1.6-3.2l3.2-4.4c-.3-.9-.5-1.9-.5-3 0-4.5 4.4-8 8.3-8z"
        fill={color}
      />
      <Path d="M23.6 22.4 28 27" stroke={color} strokeWidth="3.4" strokeLinecap="round" />
      <Circle cx="27.4" cy="26.6" r="2.1" fill={color} opacity="0.55" />
      <Circle cx="30" cy="24.2" r="2.1" fill={color} opacity="0.55" />
    </Svg>
  );
}

export function CarbsIcon({ size = 26, color = "#0A4A24" }: { size?: number; color?: string }) {
  // A wheat sheaf.
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Path d="M16 29V13" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
      <Path d="M16 15c-4 0-6-2-6-5 3 0 6 1.4 6 5z" fill={color} opacity="0.85" />
      <Path d="M16 15c4 0 6-2 6-5-3 0-6 1.4-6 5z" fill={color} opacity="0.85" />
      <Path d="M16 21c-4 0-6-2-6-5 3 0 6 1.4 6 5z" fill={color} opacity="0.6" />
      <Path d="M16 21c4 0 6-2 6-5-3 0-6 1.4-6 5z" fill={color} opacity="0.6" />
    </Svg>
  );
}

export function FatIcon({ size = 26, color = "#0A4A24" }: { size?: number; color?: string }) {
  // An oil droplet.
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Path
        d="M16 3s9 10.4 9 16a9 9 0 0 1-18 0c0-5.6 9-16 9-16z"
        fill={color}
      />
      <Path
        d="M12 19.5a4 4 0 0 0 2.4 3.5"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.65"
      />
    </Svg>
  );
}

export function FiberIcon({ size = 26, color = "#0A4A24" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Path
        d="M5 22c3-8 8-13 14-14-1 7-5 13-12 15"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M9 27c4-5 9-8 15-9" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </Svg>
  );
}

export function SugarIcon({ size = 26, color = "#0A4A24" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Rect x="7" y="13" width="18" height="14" rx="2.5" stroke={color} strokeWidth="2.2" />
      <Path d="M11 13V9.5a2.5 2.5 0 0 1 5 0V13" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <Path d="M16 13V9.5a2.5 2.5 0 0 1 5 0V13" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}

export function SodiumIcon({ size = 26, color = "#0A4A24" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Rect x="5" y="12" width="22" height="13" rx="3" stroke={color} strokeWidth="2.2" />
      <Path d="M10 12V8.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <Path d="M16 12V6.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      <Path d="M22 12V8.5" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}

/** Vitamin/mineral pill used across the micronutrient rows. */
export function MicroIcon({
  size = 18,
  color = "#00A844",
  letter,
}: {
  size?: number;
  color?: string;
  letter: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Rect x="2" y="9" width="28" height="14" rx="7" fill={color} opacity="0.18" />
      <Rect x="2" y="9" width="28" height="14" rx="7" stroke={color} strokeWidth="2" />
      <Path d="M16 9v14" stroke={color} strokeWidth="2" />
    </Svg>
  );
}

export function BowlIcon({ size = 22, color = "#00A844" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Path d="M4 16h24a12 12 0 0 1-24 0z" fill={color} />
      <Ellipse cx="16" cy="16" rx="12" ry="3.4" stroke={color} strokeWidth="2" fill="#FFFFFF" />
      <Path d="M11 11c0-2 1.6-3.4 2.6-4.4M16 10.6c0-2 1.6-3.4 2.6-4.4" stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
    </Svg>
  );
}
