export const colors = {
  surface: "#FFFFFF",
  ink: "#0A0A0F",
  muted: "#6B7280",

  mint50: "#E8FBF0",
  mint100: "#C8F5DD",
  mint300: "#6FE3A0",
  mint500: "#00C853",
  mint600: "#00A844",
  mint700: "#008737",

  jade500: "#0A4A24",
  jade600: "#083A1D",
  jade700: "#062B16",

  protein: "#00C853",
  carbs: "#0A4A24",
  fat: "#F59E0B",

  danger: "#DC2626",
  line: "#E5E7EB",
} as const;

export const AVATAR_BG = {
  apple: "#E8FBF0",
  dumbbell: "#EAF4FF",
  bolt: "#FFF7E6",
  avocado: "#F1FCEB",
  salmon: "#FFEFEA",
  carrot: "#FFF1E0",
  drop: "#E9F6FF",
} as const;

export type AvatarKey =
  | "apple"
  | "dumbbell"
  | "bolt"
  | "avocado"
  | "salmon"
  | "carrot"
  | "drop";
