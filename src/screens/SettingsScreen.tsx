import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AvatarIcon } from "../components/AvatarIcon";
import { useMetaBite } from "../context/MetaBiteContext";
import { colors, type AvatarKey } from "../theme";

function GoalRow({
  label,
  unit,
  value,
  onSave,
}: {
  label: string;
  unit: string;
  value: number;
  onSave: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <View className="mb-4 flex-row items-center gap-3">
      <Text className="w-24 text-sm font-bold text-[#0A0A0F]">{label}</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        keyboardType="number-pad"
        className="h-12 flex-1 rounded-xl border border-[#E5E7EB] px-3 text-base font-semibold text-[#0A0A0F]"
      />
      <Text className="w-8 text-sm text-[#6B7280]">{unit}</Text>
      <Pressable
        onPress={() => {
          const n = Number(draft);
          if (Number.isFinite(n) && n >= 0) onSave(Math.round(n));
        }}
        className="h-12 rounded-xl bg-[#0A4A24] px-4 items-center justify-center active:opacity-80"
      >
        <Text className="text-sm font-bold text-white">Set</Text>
      </Pressable>
    </View>
  );
}

export function SettingsScreen() {
  const { profile, updateProfile, signOut, user } = useMetaBite();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingBottom: 60 }}>
      <View style={{ paddingTop: insets.top + 16 }} className="px-6">
        <Text className="text-2xl font-extrabold text-[#0A0A0F]">Settings</Text>
        <Text className="mt-1 text-sm text-[#6B7280]" numberOfLines={1} ellipsizeMode="middle">{user?.email}</Text>
      </View>

      <View className="mt-8 items-center px-6">
        <View className="h-24 w-24 items-center justify-center rounded-3xl bg-[#E8FBF0]">
          <AvatarIcon
            name={(profile?.avatar_key as AvatarKey) ?? "bolt"}
            size={52}
            color={colors.jade500}
          />
        </View>
        <Text className="mt-3 text-lg font-extrabold text-[#0A0A0F]">
          {profile?.nickname || "Unnamed"}
        </Text>
      </View>

      <View className="mt-10 px-6">
        <Text className="mb-4 text-xs font-bold uppercase tracking-widest text-[#6B7280]">
          Daily goals
        </Text>
        <GoalRow
          label="Calories"
          unit="kcal"
          value={profile?.daily_calorie_goal ?? 2000}
          onSave={(n) => updateProfile({ daily_calorie_goal: Math.max(800, n) })}
        />
        <GoalRow
          label="Protein"
          unit="g"
          value={profile?.daily_protein_goal ?? 80}
          onSave={(n) => updateProfile({ daily_protein_goal: n })}
        />
        <GoalRow
          label="Carbs"
          unit="g"
          value={profile?.daily_carb_goal ?? 200}
          onSave={(n) => updateProfile({ daily_carb_goal: n })}
        />
        <GoalRow
          label="Fat"
          unit="g"
          value={profile?.daily_fat_goal ?? 70}
          onSave={(n) => updateProfile({ daily_fat_goal: n })}
        />
      </View>

      <View className="mt-8 px-6">
        <Pressable
          onPress={() =>
            Alert.alert("Sign out?", "You can sign back in any time.", [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: signOut },
            ])
          }
          className="h-14 items-center justify-center rounded-2xl border border-[#E5E7EB] active:opacity-70"
        >
          <Text className="text-base font-bold text-[#DC2626]">Sign out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
