import React from "react";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { colors, type AvatarKey } from "../theme";

interface Props {
  name: AvatarKey;
  size?: number;
  color?: string;
}

/**
 * Pre-made avatar set. Deliberately not user-uploadable: the DB constrains
 * avatar_key to these seven values, so there is no storage path for a photo.
 */
export function AvatarIcon({ name, size = 44, color = colors.jade500 }: Props) {
  const s = { width: size, height: size, viewBox: "0 0 64 64" } as const;

  switch (name) {
    case "apple":
      return (
        <Svg {...s}>
          <Path
            d="M32 18c-4-4-12-4-16 2-4 6-3 16 1 24 3 6 7 12 11 12 2 0 3-1 4-1s2 1 4 1c4 0 8-6 11-12 4-8 5-18 1-24-4-6-12-6-16-2z"
            fill={color}
          />
          <Path d="M32 18c0-6 4-10 10-11 0 6-4 10-10 11z" fill={color} opacity={0.55} />
        </Svg>
      );

    case "dumbbell":
      return (
        <Svg {...s}>
          <Rect x="28" y="29" width="8" height="6" rx="2" fill={color} />
          <Rect x="12" y="24" width="10" height="16" rx="3" fill={color} />
          <Rect x="42" y="24" width="10" height="16" rx="3" fill={color} />
          <Rect x="4" y="28" width="6" height="8" rx="2" fill={color} opacity={0.6} />
          <Rect x="54" y="28" width="6" height="8" rx="2" fill={color} opacity={0.6} />
        </Svg>
      );

    case "bolt":
      return (
        <Svg {...s}>
          <Path d="M36 4 14 36h11l-5 24 24-34H33z" fill={color} />
        </Svg>
      );

    case "avocado":
      return (
        <Svg {...s}>
          <Path
            d="M32 4c10 0 20 14 20 28 0 12-9 22-20 22S12 44 12 32C12 18 22 4 32 4z"
            fill={color}
            opacity={0.28}
          />
          <Path
            d="M32 10c7 0 15 12 15 22 0 9-7 16-15 16s-15-7-15-16c0-10 8-22 15-22z"
            fill={color}
            opacity={0.5}
          />
          <Circle cx="32" cy="35" r="8" fill={color} />
        </Svg>
      );

    case "salmon":
      return (
        <Svg {...s}>
          <Path
            d="M14 32c8-12 22-16 32-10 4 2 6 6 6 10s-2 8-6 10c-10 6-24 2-32-10z"
            fill={color}
            opacity={0.32}
          />
          <Path
            d="M16 32c7-9 19-12 27-7 3 2 5 5 5 7s-2 5-5 7c-8 5-20 2-27-7z"
            fill={color}
            opacity={0.55}
          />
          <G stroke={color} strokeWidth="2.5" strokeLinecap="round">
            <Path d="M24 26c3 4 3 8 0 12" />
            <Path d="M32 25c3 5 3 9 0 14" />
            <Path d="M40 26c2 4 2 8 0 12" />
          </G>
        </Svg>
      );

    case "carrot":
      return (
        <Svg {...s}>
          <Path d="M32 22 20 58h24z" fill={color} />
          <Path d="M32 22c-6-8-14-10-18-8 4 6 10 9 16 9z" fill={color} opacity={0.6} />
          <Path d="M32 22c6-8 14-10 18-8-4 6-10 9-16 9z" fill={color} opacity={0.6} />
          <Path d="M32 22c-2-8 0-14 4-18 3 6 2 13-4 18z" fill={color} opacity={0.85} />
        </Svg>
      );

    case "drop":
    default:
      return (
        <Svg {...s}>
          <Path
            d="M32 6s18 21 18 32a18 18 0 0 1-36 0C14 27 32 6 32 6z"
            fill={color}
          />
          <Path
            d="M24 38a8 8 0 0 0 5 7"
            stroke="#FFFFFF"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            opacity={0.7}
          />
        </Svg>
      );
  }
}

export const AVATARS: AvatarKey[] = [
  "apple",
  "dumbbell",
  "bolt",
  "avocado",
  "salmon",
  "carrot",
  "drop",
];

export const AVATAR_LABEL: Record<AvatarKey, string> = {
  apple: "Apple",
  dumbbell: "Dumbbell",
  bolt: "Bolt",
  avocado: "Avocado",
  salmon: "Salmon",
  carrot: "Carrot",
  drop: "Drop",
};
