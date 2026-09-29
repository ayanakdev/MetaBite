import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { loadHistory, HISTORY_DAYS, type DaySummary } from "../lib/history";
import { useMetaBite } from "../context/MetaBiteContext";
import { colors } from "../theme";

/**
 * 30-day history: a calorie bar per day plus a per-day macro breakdown.
 *
 * The bar chart is drawn with plain Views rather than a charting library - it
 * is one row of 30 fixed-width bars, which costs nothing to render and keeps
 * the bundle small.
 */
export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useMetaBite();
  // DayDetail lives in the root stack above the tabs, so navigating by name from
  // here bubbles up to it.
  const navigation = useNavigation<any>();
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [metric, setMetric] = useState<"calories" | "protein_g">("calories");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setDays(await loadHistory(HISTORY_DAYS));
    } catch {
      setDays([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Re-reads whenever the user saves a meal, so History is never stale.
  }, [load, profile?.updated_at]);

  const kcalGoal = profile?.daily_calorie_goal ?? 0;
  const proteinGoal = profile?.daily_protein_goal ?? 0;
  const logged = (days ?? []).filter((d) => d.meal_count > 0);
  const peak = Math.max(1, ...(days ?? []).map((d) => d[metric]));
  const avgKcal = logged.length
    ? Math.round(logged.reduce((a, d) => a + d.calories, 0) / logged.length)
    : 0;
  const avgProtein = logged.length
    ? Math.round((logged.reduce((a, d) => a + d.protein_g, 0) / logged.length) * 10) / 10
    : 0;
  
  

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.mint500} />
      }
    >
      <View style={{ paddingTop: insets.top + 12 }}>
        <Text className="text-xs font-bold uppercase tracking-widest text-[#6B7280]">
          Last {HISTORY_DAYS} days
        </Text>
        <Text className="text-2xl font-extrabold text-[#0A0A0F]">History</Text>
      </View>

      <View className="mt-5 flex-row gap-3">
        <Stat label="Days logged" value={`${logged.length}`} sub={`of ${HISTORY_DAYS}`} />
        <Stat label="Avg calories" value={`${avgKcal}`} sub="kcal / day" />
        <Stat label="Avg protein" value={`${avgProtein}`} sub="g / day" />
      </View>

      <View className="mt-6 rounded-3xl border border-[#E5E7EB] p-4">
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="text-sm font-extrabold text-[#0A0A0F]">Daily trend</Text>
          <View className="flex-row rounded-full bg-[#F3F4F6] p-0.5">
            {(
              [
                { key: "calories", label: "kcal" },
                { key: "protein_g", label: "protein" },
              ] as const
            ).map((m) => (
              <Pressable
                key={m.key}
                onPress={() => setMetric(m.key)}
                className="rounded-full px-3 py-1"
                style={metric === m.key ? { backgroundColor: colors.jade500 } : undefined}
              >
                <Text
                  className="text-[11px] font-bold"
                  style={{ color: metric === m.key ? "#FFFFFF" : "#6B7280" }}
                >
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {days === null ? (
          <ActivityIndicator color={colors.mint500} className="py-10" />
        ) : (
          <View className="h-28 flex-row items-end gap-[3px]">
            {days.map((d) => {
              const pct = d[metric] / peak;
              const hit = metric === "calories" ? d.calories >= kcalGoal && kcalGoal > 0 : d.protein_g >= proteinGoal && proteinGoal > 0;
              return (
                <View
                  key={d.day}
                  className="flex-1"
                  style={{ height: "100%", justifyContent: "flex-end" }}
                >
                  <View
                    style={{
                      height: `${Math.max(pct * 100, d[metric] > 0 ? 6 : 2)}%`,
                      backgroundColor:
                        d[metric] === 0
                          ? "#E5E7EB"
                          : hit
                            ? colors.mint500
                            : colors.jade500,
                      borderTopLeftRadius: 3,
                      borderTopRightRadius: 3,
                    }}
                  />
                </View>
              );
            })}
          </View>
        )}

        <View className="mt-2 flex-row justify-between">
          <Text className="text-[10px] font-semibold text-[#9CA3AF]">30 days ago</Text>
          <Text className="text-[10px] font-semibold text-[#9CA3AF]">Today</Text>
        </View>
      </View>

      <Text className="mb-3 mt-7 text-xs font-bold uppercase tracking-widest text-[#6B7280]">
        Day by day
      </Text>
      {logged.length > 0 ? (
        <Text className="-mt-1 mb-3 text-[11px] font-semibold text-[#9CA3AF]">
          Tap a day to see its meals, macros and micronutrients.
        </Text>
      ) : null}

      {days === null ? null : days.length === 0 || logged.length === 0 ? (
        <View className="items-center rounded-3xl bg-[#F9FAFB] px-6 py-10">
          <Text className="text-center text-sm text-[#6B7280]">
            No meals logged in the last {HISTORY_DAYS} days.
          </Text>
        </View>
      ) : (
        days
          .slice()
          .reverse()
          .map((d) => (
            <Pressable
              key={d.day}
              onPress={() => navigation.navigate("DayDetail", { day: d.day })}
              disabled={d.meal_count === 0}
              className="mb-2 flex-row items-center rounded-2xl border border-[#E5E7EB] px-4 py-3 active:opacity-70"
            >
              <View className="w-16">
                <Text className="text-sm font-extrabold text-[#0A0A0F]">{d.label}</Text>
                <Text className="text-[10px] font-semibold text-[#9CA3AF]">{d.weekday}</Text>
              </View>

              <View className="flex-1">
                {d.meal_count === 0 ? (
                  <Text className="text-xs text-[#9CA3AF]">Nothing logged</Text>
                ) : (
                  <>
                    <Text className="text-sm font-extrabold text-[#0A0A0F]">
                      {d.calories} kcal
                    </Text>
                    <Text className="mt-0.5 text-[11px] font-semibold text-[#6B7280]">
                      <Text style={{ color: "#DC2626" }}>P {d.protein_g}g</Text>
                      {"  ·  "}
                      <Text style={{ color: "#2563EB" }}>C {d.carbs_g}g</Text>
                      {"  ·  "}
                      <Text style={{ color: "#D97706" }}>F {d.fat_g}g</Text>
                    </Text>
                  </>
                )}
              </View>

              {d.meal_count > 0 ? (
                <View className="flex-row items-center">
                  <View
                    className="rounded-full px-2.5 py-1"
                    style={{ backgroundColor: colors.mint50 }}
                  >
                    <Text
                      className="text-[10px] font-extrabold"
                      style={{ color: colors.jade500 }}
                    >
                      {d.meal_count} {d.meal_count === 1 ? "meal" : "meals"}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.muted}
                    style={{ marginLeft: 8 }}
                  />
                </View>
              ) : null}
            </Pressable>
          ))
      )}
    </ScrollView>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View className="flex-1 items-center rounded-2xl bg-[#F9FAFB] px-2 py-3">
      <Text className="text-lg font-extrabold text-[#0A0A0F]">{value}</Text>
      <Text className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#6B7280]">
        {label}
      </Text>
      <Text className="mt-0.5 text-[9px] font-semibold text-[#9CA3AF]">{sub}</Text>
    </View>
  );
}
