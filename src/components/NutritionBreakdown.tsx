import React from "react";
import { Text, View } from "react-native";
import {
  BowlIcon,
  CarbsIcon,
  FatIcon,
  FiberIcon,
  MicroIcon,
  ProteinIcon,
  SodiumIcon,
  SugarIcon,
} from "./NutritionIcons";
import { colors } from "../theme";
import type { Micros, ParsedMeal } from "../lib/types";
import { nfOneDp } from "../lib/format";

/** FDA-style daily reference values, used to render "% DV". */
const DV: Record<string, number> = {
  "Vitamin A": 900,
  "Vitamin C": 90,
  "Vitamin D": 20,
  Calcium: 1300,
  Iron: 18,
  Potassium: 4700,
  Zinc: 11,
  Fiber: 28,
  Sodium: 2300,
  Sugar: 50,
};

function MacroCard({
  label,
  grams,
  kcalShare,
  tint,
  icon,
}: {
  label: string;
  grams: number;
  kcalShare: number;
  tint: string;
  icon: React.ReactNode;
}) {
  return (
    <View className="flex-1 rounded-2xl border border-[#E5E7EB] px-3 py-4">
      <View className="items-center">
        <View
          className="mb-2 h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${tint}1A` }}
        >
          {icon}
        </View>
        <Text className="text-lg font-extrabold text-[#0A0A0F]">
          {nfOneDp.format(grams)}
          <Text className="text-xs font-bold text-[#6B7280]">g</Text>
        </Text>
        <Text
          className="mt-0.5 text-[10px] font-extrabold uppercase tracking-widest"
          style={{ color: tint }}
        >
          {label}
        </Text>
      </View>
      <View className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#F3F4F6]">
        <View
          className="h-full rounded-full"
          style={{ width: `${Math.max(3, Math.min(100, kcalShare))}%`, backgroundColor: tint }}
        />
      </View>
      <Text className="mt-1.5 text-center text-[10px] font-semibold text-[#6B7280]">
        {Math.round(kcalShare)}% of kcal
      </Text>
    </View>
  );
}

function MicroRow({
  name,
  value,
  unit,
}: {
  name: string;
  value: number;
  unit: string;
}) {
  const ref = DV[name];
  const pct = ref ? Math.min(100, (value / ref) * 100) : 0;
  return (
    <View className="flex-row items-center py-2.5">
      <MicroIcon color={colors.mint600} letter={name} />
      <Text className="ml-2.5 flex-1 text-sm font-bold text-[#0A0A0F]">{name}</Text>
      <View className="mr-3 h-1.5 w-20 overflow-hidden rounded-full bg-[#F3F4F6]">
        <View
          className="h-full rounded-full bg-[#00C853]"
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </View>
      <Text className="w-24 text-right text-xs font-semibold text-[#6B7280]">
        {nfOneDp.format(value)} {unit}
        {ref ? <Text className="text-[10px]"> · {Math.round(pct)}% DV</Text> : null}
      </Text>
    </View>
  );
}

export function NutritionBreakdown({
  meal,
  ingredients,
}: {
  meal: ParsedMeal;
  ingredients: ParsedMeal["ingredients"];
}) {
  const cals = meal.calories || 0;
  const p = meal.protein_g || 0;
  const c = meal.carbs_g || 0;
  const f = meal.fat_g || 0;

  // Macro calorie shares, from 4/4/9 kcal per gram.
  const pKcal = p * 4;
  const cKcal = c * 4;
  const fKcal = f * 9;
  const macroTotal = pKcal + cKcal + fKcal || 1;

  const micros: Micros | undefined = meal.micros;
  const microEntries = micros
    ? (Object.entries(micros) as [keyof Micros, number][]).filter(([, v]) => v > 0)
    : [];

  return (
    <View>
      {/* ---- macronutrients ---- */}
      <Text className="mb-3 text-xs font-bold uppercase tracking-widest text-[#6B7280]">
        Macronutrients
      </Text>
      <View className="mb-6 flex-row gap-2.5">
        <MacroCard
          label="Protein"
          grams={p}
          kcalShare={(pKcal / macroTotal) * 100}
          tint="#00A844"
          icon={<ProteinIcon size={24} color={colors.jade500} />}
        />
        <MacroCard
          label="Carbs"
          grams={c}
          kcalShare={(cKcal / macroTotal) * 100}
          tint="#0A4A24"
          icon={<CarbsIcon size={24} color={colors.jade500} />}
        />
        <MacroCard
          label="Fat"
          grams={f}
          kcalShare={(fKcal / macroTotal) * 100}
          tint="#B45309"
          icon={<FatIcon size={24} color="#B45309" />}
        />
      </View>

      {/* ---- other essentials ---- */}
      <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-[#6B7280]">
        Also in this meal
      </Text>
      <View className="mb-6 rounded-2xl border border-[#E5E7EB] px-4">
        <MicroRow name="Fiber" value={meal.fiber_g || 0} unit="g" />
        <View className="h-px bg-[#F3F4F6]" />
        <MicroRow name="Sugar" value={meal.sugar_g || 0} unit="g" />
        <View className="h-px bg-[#F3F4F6]" />
        <MicroRow name="Sodium" value={meal.sodium_mg || 0} unit="mg" />
      </View>

      {/* ---- micronutrients ---- */}
      {microEntries.length ? (
        <View className="mb-6">
          <View className="mb-1 flex-row items-center gap-2">
            <Text className="text-xs font-bold uppercase tracking-widest text-[#6B7280]">
              Micronutrients
            </Text>
          </View>
          <Text className="mb-2 text-[11px] leading-4 text-[#9CA3AF]">
            Estimated from the identified foods, not measured. Use the USDA verify
            button below for measured values.
          </Text>
          <View className="rounded-2xl border border-[#E5E7EB] px-4">
            {microEntries.map(([k, v], i) => (
              <View key={k}>
                {i > 0 ? <View className="h-px bg-[#F3F4F6]" /> : null}
                <MicroRow
                  name={k}
                  value={v}
                  unit={k === "Vitamin D" || k === "Vitamin A" ? "mcg" : "mg"}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* ---- ingredient count summary ---- */}
      <View className="mb-4 flex-row items-center gap-2 rounded-2xl bg-[#E8FBF0] px-4 py-3">
        <BowlIcon />
        <Text className="text-sm font-bold text-[#0A4A24]">
          {ingredients.length} item{ingredients.length === 1 ? "" : "s"} ·{" "}
          {nfOneDp.format(cals)} kcal total
        </Text>
      </View>
    </View>
  );
}

