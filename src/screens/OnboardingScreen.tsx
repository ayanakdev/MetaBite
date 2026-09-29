import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AVATARS, AVATAR_LABEL, AvatarIcon } from "../components/AvatarIcon";
import { useMetaBite } from "../context/MetaBiteContext";
import { AVATAR_BG, colors, type AvatarKey } from "../theme";

function Stepper({
  label,
  unit,
  value,
  onChange,
  step = 50,
  min = 0,
  max = 10000,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  return (
    <View className="mb-4">
      <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-[#6B7280]">
        {label}
      </Text>
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => onChange(clamp(value - step))}
          className="h-14 w-14 items-center justify-center rounded-2xl bg-[#F3F4F6] active:opacity-70"
          style={{ minWidth: 56 }}
        >
          <Text className="text-2xl font-bold text-[#0A4A24]">−</Text>
        </Pressable>

        <View className="h-14 flex-1 items-center justify-center rounded-2xl border border-[#E5E7EB]">
          <Text className="text-xl font-extrabold text-[#0A0A0F]">
            {value.toLocaleString()} {unit}
          </Text>
        </View>

        <Pressable
          onPress={() => onChange(clamp(value + step))}
          className="h-14 w-14 items-center justify-center rounded-2xl bg-[#0A4A24] active:opacity-80"
          style={{ minWidth: 56 }}
        >
          <Text className="text-2xl font-bold text-white">+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function OnboardingScreen() {
  const { profile, updateProfile } = useMetaBite();
  const insets = useSafeAreaInsets();

  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [avatar, setAvatar] = useState<AvatarKey>(
    (profile?.avatar_key as AvatarKey) ?? "bolt",
  );
  const [calories, setCalories] = useState(profile?.daily_calorie_goal ?? 2000);
  const [protein, setProtein] = useState(profile?.daily_protein_goal ?? 80);
  const [carbs, setCarbs] = useState(profile?.daily_carb_goal ?? 200);
  const [fat, setFat] = useState(profile?.daily_fat_goal ?? 70);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await updateProfile({
        nickname: nickname.trim(),
        avatar_key: avatar,
        daily_calorie_goal: calories,
        daily_protein_goal: protein,
        daily_carb_goal: carbs,
        daily_fat_goal: fat,
        onboarded_at: new Date().toISOString(),
      });
    } finally {
      setBusy(false);
    }
  }

  // Tile size is derived from the real viewport so the avatar grid always
  // fills each row evenly, from a 320 px phone up to a tablet, instead of
  // leaving a ragged gap on the right.
  const { width: vw } = useWindowDimensions();
  const cols = vw >= 640 ? 6 : vw >= 400 ? 4 : 3;
  const tile = Math.floor((vw - 48 - 12 * (cols - 1)) / cols);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-white"
    >
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingTop: insets.top + 16 }}>
          <Text className="text-2xl font-extrabold text-[#0A0A0F]">Set up MetaBite</Text>
          <Text className="mt-1 text-sm text-[#6B7280]">
            Pick a look and tune your daily targets. You can change these any time.
          </Text>
        </View>

        <Text className="mb-3 mt-8 text-xs font-bold uppercase tracking-widest text-[#6B7280]">
          Your nickname
        </Text>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          placeholder="What should we call you?"
          placeholderTextColor="#9CA3AF"
          className="rounded-2xl border border-[#E5E7EB] px-4 py-4 text-base text-[#0A0A0F]"
        />

        <Text className="mb-3 mt-8 text-xs font-bold uppercase tracking-widest text-[#6B7280]">
          Choose your avatar
        </Text>
        <View className="flex-row flex-wrap" style={{ gap: 12 }}>
          {AVATARS.map((key) => {
            const selected = avatar === key;
            return (
              <Pressable
                key={key}
                onPress={() => setAvatar(key)}
                className="items-center"
                style={{ width: tile }}
              >
                <View
                  className="items-center justify-center rounded-3xl"
                  style={{
                    width: tile,
                    height: tile,
                    backgroundColor: selected ? colors.mint100 : AVATAR_BG[key],
                    borderWidth: selected ? 3 : 1,
                    borderColor: selected ? colors.mint500 : "#E5E7EB",
                  }}
                >
                  <AvatarIcon
                    name={key}
                    size={Math.round(tile * 0.55)}
                    color={selected ? colors.jade500 : colors.muted}
                  />
                </View>
                <Text
                  className="mt-1.5 text-center text-[11px] font-semibold"
                  style={{ color: selected ? colors.jade500 : colors.muted }}
                >
                  {AVATAR_LABEL[key]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="mb-3 mt-8 text-xs font-bold uppercase tracking-widest text-[#6B7280]">
          Daily targets
        </Text>

        <Stepper
          label="Calories"
          unit="kcal"
          value={calories}
          onChange={setCalories}
          step={50}
          min={800}
          max={10000}
        />
        <Stepper
          label="Protein"
          unit="g"
          value={protein}
          onChange={setProtein}
          step={5}
          max={1000}
        />
        <Stepper
          label="Carbohydrates"
          unit="g"
          value={carbs}
          onChange={setCarbs}
          step={5}
          max={2000}
        />
        <Stepper
          label="Fat"
          unit="g"
          value={fat}
          onChange={setFat}
          step={5}
          max={1000}
        />

        <Pressable
          onPress={save}
          disabled={busy}
          className="mt-6 items-center rounded-2xl bg-[#0A4A24] py-4 active:opacity-80"
          style={{ minHeight: 52 }}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-base font-extrabold text-white">
              Start tracking
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
