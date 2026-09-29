import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { NutritionBreakdown } from "../components/NutritionBreakdown";
import { loadDay } from "../lib/history";
import { useMetaBite } from "../context/MetaBiteContext";
import { colors } from "../theme";
import type { LoggedMeal, Micros, ParsedMeal } from "../lib/types";
import { nfWhole, nfOneDp } from "../lib/format";

/**
 * One day in the history, opened.
 *
 * The 30-day chart deliberately carries only four aggregate columns, because
 * that is all a bar needs. Opening a day is therefore its own small fetch rather
 * than a wider version of the chart query - see loadDayMeals for why that is the
 * cheaper trade on the free tier.
 */

function when(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function DayDetailScreen({
  day,
  onBack,
  onOpenMeal,
}: {
  /** YYYY-MM-DD, app-local. */
  day: string;
  onBack: () => void;
  onOpenMeal: (meal: LoggedMeal) => void;
}) {
  const insets = useSafeAreaInsets();
  const { profile } = useMetaBite();

  const [state, setState] = useState<{
    loading: boolean;
    error: boolean;
    meals: LoggedMeal[];
    totals: Awaited<ReturnType<typeof loadDay>>["totals"] | null;
  }>({ loading: true, error: false, meals: [], totals: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: false }));
    try {
      const { totals, meals } = await loadDay(day);
      setState({ loading: false, error: false, meals, totals });
    } catch {
      setState({ loading: false, error: true, meals: [], totals: null });
    }
  }, [day]);

  useEffect(() => {
    load();
  }, [load]);

  const { totals } = state;

  // Adapt the day roll-up to the shape NutritionBreakdown already consumes, so
  // the macro cards, the fiber/sugar/sodium rows and the % DV micronutrient
  // bars are all exactly the same component the meal screens use.
  const asMeal: ParsedMeal | null = totals
    ? {
        title: `${totals.label} ${totals.weekday}`,
        ingredients: [],
        calories: totals.calories,
        protein_g: totals.protein_g,
        carbs_g: totals.carbs_g,
        fat_g: totals.fat_g,
        fiber_g: totals.fiber_g,
        sugar_g: totals.sugar_g,
        sodium_mg: totals.sodium_mg,
        micros: (Object.keys(totals.micros).length ? totals.micros : undefined) as Micros | undefined,
      }
    : null;

  const kcalGoal = profile?.daily_calorie_goal ?? 0;
  const proteinGoal = profile?.daily_protein_goal ?? 0;
  const pct = kcalGoal > 0 && totals ? Math.min(100, (totals.calories / kcalGoal) * 100) : 0;

  return (
    <View className="flex-1 bg-white">
      <View
        className="flex-row items-center border-b border-[#E5E7EB] px-4"
        style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}
      >
        <Pressable onPress={onBack} hitSlop={12} className="flex-row items-center">
          <Ionicons name="chevron-back" size={22} color={colors.jade500} />
          <Text className="ml-0.5 text-base font-semibold text-[#0A4A24]">History</Text>
        </Pressable>
      </View>

      {state.loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.mint500} size="large" />
        </View>
      ) : state.error || !totals ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm text-[#6B7280]">
            Could not load that day. Pull back and try again.
          </Text>
          <Pressable
            onPress={load}
            className="mt-4 rounded-2xl bg-[#0A4A24] px-6 py-3 active:opacity-80"
          >
            <Text className="text-sm font-bold text-white">Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          <Text className="text-2xl font-extrabold text-[#0A0A0F]">{totals.label}</Text>
          <Text className="mt-0.5 text-sm font-semibold text-[#6B7280]">
            {totals.weekday} · {totals.meal_count}{" "}
            {totals.meal_count === 1 ? "meal" : "meals"}
          </Text>

          {/* headline calorie figure, with the day's progress against the goal */}
          <View className="mt-5 overflow-hidden rounded-3xl border border-[#E5E7EB]">
            <View className="items-center bg-[#E8FBF0] px-5 py-5">
              <Text className="text-[11px] font-extrabold uppercase tracking-[2px] text-[#0A4A24]">
                Total for the day
              </Text>
              <Text className="mt-0.5 text-5xl font-extrabold text-[#0A0A0F]">
                {nfWhole.format(totals.calories)}
              </Text>
              <Text className="mt-0.5 text-xs font-semibold text-[#6B7280]">
                kcal{kcalGoal > 0 ? ` of ${nfWhole.format(kcalGoal)}` : ""}
              </Text>
            </View>
            {kcalGoal > 0 ? (
              <View className="h-2 w-full bg-[#E5E7EB]">
                <View style={{ width: `${pct}%`, height: "100%", backgroundColor: colors.mint500 }} />
              </View>
            ) : null}
          </View>

          {asMeal ? <NutritionBreakdown meal={asMeal} ingredients={[]} /> : null}

          {proteinGoal > 0 && totals.protein_g > 0 ? (
            <View className="mt-1 mb-6 rounded-2xl bg-[#F9FAFB] px-4 py-3">
              <Text className="text-sm font-semibold text-[#6B7280]">
                {nfOneDp.format(totals.protein_g)} g protein ·{" "}
                {nfWhole.format(totals.protein_g)} g of {nfWhole.format(proteinGoal)} g goal
              </Text>
            </View>
          ) : null}

          <Text className="mb-3 mt-7 text-xs font-bold uppercase tracking-widest text-[#6B7280]">
            Meals that day
          </Text>

          {state.meals.length === 0 ? (
            <Text className="text-sm text-[#6B7280]">Nothing was logged on this day.</Text>
          ) : (
            <View className="gap-2.5">
              {state.meals.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => onOpenMeal(m)}
                  className="flex-row items-center rounded-2xl border border-[#E5E7EB] px-4 py-3.5 active:opacity-70"
                >
                  <View className="flex-1 pr-3">
                    <Text className="font-bold text-[#0A0A0F]" numberOfLines={1}>
                      {m.title}
                    </Text>
                    <Text className="mt-0.5 text-xs text-[#6B7280]">
                      {when(m.logged_at)} · P{nfOneDp.format(Number(m.protein_g))}g · C
                      {nfOneDp.format(Number(m.carbs_g))}g · F
                      {nfOneDp.format(Number(m.fat_g))}g
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
        </ScrollView>
      )}
    </View>
  );
}
