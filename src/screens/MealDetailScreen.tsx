import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NutritionBreakdown } from "../components/NutritionBreakdown";
import { BowlIcon } from "../components/NutritionIcons";
import { colors } from "../theme";
import { edibleWeight, hasBone, type Ingredient, type LoggedMeal, type Micros, type ParsedMeal } from "../lib/types";
import { nfOneDp } from "../lib/format";

function when(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const SOURCE_LABEL: Record<string, string> = {
  gemini: "AI estimate, cross-checked",
  usda: "USDA FoodData Central",
  openfoodfacts: "Open Food Facts",
  spoonacular: "Spoonacular",
  manual: "Entered by you",
};

export function MealDetailScreen({
  meal,
  onBack,
}: {
  meal: LoggedMeal;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();

  // The stored row is the source of truth; this just adapts it to the shape the
  // breakdown component already consumes.
  const ingredients: Ingredient[] = Array.isArray(meal.ingredients)
    ? meal.ingredients.map((i: any) => ({
        name: String(i?.name ?? "Unknown"),
        quantity_g: Number(i?.quantity_g ?? 0),
        // Carried through so the ingredient list can show what was deducted as
        // bone. Meals logged before this field existed simply have none.
        edible_g: i?.edible_g === undefined ? undefined : Number(i.edible_g),
        calories: Number(i?.calories ?? 0),
        protein_g: Number(i?.protein_g ?? 0),
        carbs_g: Number(i?.carbs_g ?? 0),
        fat_g: Number(i?.fat_g ?? 0),
      }))
    : [];

  const asMeal: ParsedMeal = {
    title: meal.title,
    ingredients,
    calories: Number(meal.calories),
    protein_g: Number(meal.protein_g),
    carbs_g: Number(meal.carbs_g),
    fat_g: Number(meal.fat_g),
    fiber_g: Number(meal.fiber_g),
    sugar_g: Number(meal.sugar_g),
    sodium_mg: Number(meal.sodium_mg),
    micros: (meal.micros ?? undefined) as Micros | undefined,
  };

  return (
    <View className="flex-1 bg-white">
      <View
        className="flex-row items-center border-b border-[#E5E7EB] px-4"
        style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}
      >
        <Pressable onPress={onBack} hitSlop={12} className="flex-row items-center">
          <Text className="text-2xl font-light text-[#0A4A24]">‹</Text>
          <Text className="ml-1 text-base font-semibold text-[#0A4A24]">
            Dashboard
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        {/* hero */}
        <View className="mb-6 items-center">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-[#E8FBF0]">
            <BowlIcon size={30} />
          </View>
          <Text className="mt-3 text-center text-2xl font-extrabold text-[#0A0A0F]">
            {meal.title}
          </Text>
          <Text className="mt-1 text-sm text-[#6B7280]">
            {day(meal.logged_at)} at {when(meal.logged_at)}
          </Text>
          <View className="mt-3 rounded-full bg-[#F3F4F6] px-3 py-1">
            <Text className="text-[11px] font-semibold text-[#6B7280]">
              {SOURCE_LABEL[meal.source] ?? meal.source}
            </Text>
          </View>
        </View>

        <NutritionBreakdown meal={asMeal} ingredients={ingredients} />

        {/* ingredients */}
        <Text className="mb-3 text-xs font-bold uppercase tracking-widest text-[#6B7280]">
          Ingredients
        </Text>
        {ingredients.length === 0 ? (
          <Text className="text-sm text-[#6B7280]">
            No ingredient breakdown was stored for this meal.
          </Text>
        ) : (
          <View className="gap-2.5">
            {ingredients.map((ing, i) => (
              <View
                key={`${ing.name}-${i}`}
                className="flex-row items-center rounded-2xl border border-[#E5E7EB] px-4 py-3.5"
              >
                <View className="flex-1 pr-3">
                  <Text className="flex-1 font-bold text-[#0A0A0F]" numberOfLines={2}>{ing.name}</Text>
                  <Text className="mt-0.5 text-xs text-[#6B7280]">
                    {nfOneDp.format(ing.quantity_g)}g · P{nfOneDp.format(ing.protein_g)} C
                    {nfOneDp.format(ing.carbs_g)} F{nfOneDp.format(ing.fat_g)}
                  </Text>
                  {hasBone(ing) ? (
                    <Text className="mt-0.5 text-[11px] font-semibold text-[#B45309]">
                      {nfOneDp.format(ing.quantity_g - edibleWeight(ing))}g bone deducted
                    </Text>
                  ) : null}
                </View>
                <Text className="text-base font-extrabold text-[#0A4A24]">
                  {nfOneDp.format(ing.calories)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {meal.ai_notes ? (
          <View className="mt-6 rounded-2xl bg-[#F9FAFB] px-4 py-3.5">
            <Text className="text-[11px] font-bold uppercase tracking-widest text-[#6B7280]">
              Notes
            </Text>
            <Text className="mt-1 text-sm leading-5 text-[#6B7280]">
              {meal.ai_notes}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

