import React, { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AvatarIcon } from "../components/AvatarIcon";
import { FluidTank, MiniTank } from "../components/FluidTank";
import { useMetaBite } from "../context/MetaBiteContext";
import { Ionicons } from "@expo/vector-icons";
import { colors, type AvatarKey } from "../theme";
import type { LoggedMeal } from "../lib/types";
import { nfWhole } from "../lib/format";

export function DashboardScreen({
  onScan,
  onOpenMeal,
}: {
  onScan: () => void;
  onOpenMeal: (meal: LoggedMeal) => void;
}) {
  const { profile, totals, meals, refreshDay, refreshMeals } = useMetaBite();
  const insets = useSafeAreaInsets();
  const { width: vw } = useWindowDimensions();
  const tankSize = Math.max(200, Math.min(272, vw - 56));
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshDay(), refreshMeals()]);
    setRefreshing(false);
  }, [refreshDay, refreshMeals]);

  const goalC = profile?.daily_calorie_goal ?? 2000;
  const goalP = profile?.daily_protein_goal ?? 80;
  const goalCb = profile?.daily_carb_goal ?? 200;

  const cUsed = totals?.calories ?? 0;
  const pUsed = totals?.protein_g ?? 0;
  const cbUsed = totals?.carbs_g ?? 0;

  const cLeft = Math.max(0, goalC - cUsed);
  const pLeft = Math.max(0, goalP - pUsed);
  const cbLeft = Math.max(0, goalCb - cbUsed);

  const clamp01 = (used: number, goal: number) =>
    goal <= 0 ? 0 : Math.min(1, used / goal);

  return (
    <View className="flex-1 bg-white">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mint500} />
        }
      >
        {/* header */}
        {/* flex-1 + numberOfLines on the text block, shrink-0 on the avatar:
            without these a long nickname pushes the avatar off the row on a
            narrow phone. */}
        <View
          className="flex-row items-center justify-between px-6"
          style={{ paddingTop: insets.top + 12 }}
        >
          <View className="flex-1 pr-3">
            <Text className="text-xs font-bold uppercase tracking-widest text-[#6B7280]">
              Today
            </Text>
            <Text
              className="text-2xl font-extrabold text-[#0A0A0F]"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {profile?.nickname || "there"}
            </Text>
          </View>
          <View className="h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBF0]">
            <AvatarIcon
              name={(profile?.avatar_key as AvatarKey) ?? "bolt"}
              size={28}
              color={colors.jade500}
            />
          </View>
        </View>

        {/* hero tank - capped at 272 but shrunk to fit narrow phones, since a
            fixed 272 clips on a 320 px screen once the page padding is added. */}
        <View className="mt-8 items-center">
          <FluidTank
            progress={clamp01(cUsed, goalC)}
            size={tankSize}
            centerPrimary={`${nfWhole.format(cUsed)} / ${nfWhole.format(goalC)}`}
            centerSecondary="kcal consumed"
          />
          <View className="-mt-6 rounded-full bg-[#0A4A24] px-5 py-2">
            <Text className="text-sm font-extrabold text-white">
              {nfWhole.format(cLeft)} kcal left
            </Text>
          </View>
        </View>

        {/* macro mini tanks */}
        <View className="mt-10 flex-row justify-center gap-5 px-6">
          <View className="items-center">
            <MiniTank
              progress={clamp01(pUsed, goalP)}
              color={colors.protein}
              value={`${nfWhole.format(pUsed)}g`}
              label={`/ ${nfWhole.format(goalP)}g`}
            />
            <Text className="mt-2 text-xs font-extrabold uppercase tracking-widest text-[#0A4A24]">
              Protein
            </Text>
            <Text className="text-[11px] text-[#6B7280]">{nfWhole.format(pLeft)}g left</Text>
          </View>

          <View className="items-center">
            <MiniTank
              progress={clamp01(cbUsed, goalCb)}
              color={colors.carbs}
              value={`${nfWhole.format(cbUsed)}g`}
              label={`/ ${nfWhole.format(goalCb)}g`}
            />
            <Text className="mt-2 text-xs font-extrabold uppercase tracking-widest text-[#0A4A24]">
              Carbs
            </Text>
            <Text className="text-[11px] text-[#6B7280]">{nfWhole.format(cbLeft)}g left</Text>
          </View>
        </View>

        {/* today's log */}
        <View className="mt-10 px-6">
          <Text className="mb-3 text-xs font-bold uppercase tracking-widest text-[#6B7280]">
            Today's log
          </Text>

          {meals.length === 0 ? (
            <View className="rounded-3xl border border-dashed border-[#E5E7EB] px-6 py-10 items-center">
              <Text className="text-center text-sm text-[#6B7280]">
                Nothing logged yet.{"\n"}Scan a plate to get started.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {meals.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => onOpenMeal(m)}
                  className="flex-row items-center justify-between rounded-2xl border border-[#E5E7EB] px-4 py-4 active:opacity-70"
                >
                  <View className="flex-1 pr-3">
                    <Text className="font-bold text-[#0A0A0F]" numberOfLines={1}>
                      {m.title}
                    </Text>
                    <Text className="mt-0.5 text-xs text-[#6B7280]">
                      P {nfWhole.format(Number(m.protein_g))}g · C{" "}
                      {nfWhole.format(Number(m.carbs_g))}g · F {nfWhole.format(Number(m.fat_g))}g
                    </Text>
                  </View>
                  <Text className="text-base font-extrabold text-[#0A4A24]">
                    {nfWhole.format(Number(m.calories))}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.muted}
                    style={{ marginLeft: 8 }}
                  />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* scan CTA - lifted clear of the tab bar (60px) and the system nav
          bar, otherwise it renders half-hidden behind them */}
      <Pressable
        onPress={onScan}
        className="absolute right-5 h-16 w-16 items-center justify-center rounded-full bg-[#0A4A24] active:opacity-85"
        style={{
          bottom: 60 + insets.bottom + 16,
          shadowColor: "#0A4A24",
          shadowOpacity: 0.3,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <View className="h-4 w-4 rounded-full border-[3px] border-white" />
        <View className="absolute h-4 w-4 rounded-full border-[3px] border-white opacity-40" />
        <View className="absolute h-4 w-4 rounded-full border-[3px] border-white opacity-15" />
      </Pressable>
    </View>
  );
}

