import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { recalculateMeal, sumIngredients } from "../lib/gemini";
import { applyVerification, verifyAll, verifyIngredientRow } from "../lib/verify";
import { NutritionBreakdown } from "../components/NutritionBreakdown";
import { auditMeal } from "../lib/sanity";
import { supabase } from "../lib/supabase";
import { useMetaBite } from "../context/MetaBiteContext";
import { colors } from "../theme";
import type { ParsedMeal } from "../lib/types";
import { edibleWeight, hasBone } from "../lib/types";
import { nfWhole } from "../lib/format";

export function IngredientEditorScreen({
  initial,
  onDone,
  onCancel,
}: {
  initial: ParsedMeal;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { user, refreshDay, refreshMeals } = useMetaBite();
  const insets = useSafeAreaInsets();
  const { width: vw } = useWindowDimensions();

  const [title, setTitle] = useState(initial.title);
  const [ingredients, setIngredients] = useState(initial.ingredients);
  const [newItem, setNewItem] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<Record<number, string>>({});

  const local = sumIngredients(ingredients);
  const kcal = initial.calories > 0 ? initial.calories : local.calories;

  // Totals shown in the breakdown must reflect live edits, not the original
  // model output, so the numbers move the moment a row changes.
  const mealForDisplay: ParsedMeal = {
    ...initial,
    calories: local.calories,
    protein_g: local.protein_g,
    carbs_g: local.carbs_g,
    fat_g: local.fat_g,
  };

  // Re-audited on every edit, so a corrected row clears its own warning.
  const issues = auditMeal(mealForDisplay);

  /** Cross-check every row against Open Food Facts / USDA without blocking. */
  async function runVerification() {
    if (ingredients.length === 0) return;
    setVerifying(true);
    try {
      const hits = await verifyAll(ingredients);
      if (hits.length) {
        setIngredients((prev) =>
          prev.map((ing, i) => {
            const hit = hits.find((h) => h.index === i);
            return hit ? applyVerification(ing, hit.verification) : ing;
          }),
        );
      }
      const labels: Record<number, string> = {};
      for (const h of hits) labels[h.index] = h.verification.label;
      setVerified(labels);
    } finally {
      setVerifying(false);
    }
  }

  /** Verify a single row on demand. */
  async function verifyOne(i: number) {
    const v = await verifyIngredientRow(ingredients[i]);
    if (!v) return;
    setIngredients((prev) =>
      prev.map((ing, idx) => (idx === i ? applyVerification(ing, v) : ing)),
    );
    setVerified((prev) => ({ ...prev, [i]: v.label }));
  }

  function removeAt(i: number) {
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));
    setVerified({});
  }

  /** Send the edited list back to the model to price the new item. */
  async function addIngredient() {
    const term = newItem.trim();
    if (!term) return;
    setBusy(true);
    try {
      const updated = await recalculateMeal({
        title,
        ingredients: [
          ...ingredients,
          { name: term, quantity_g: 100, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
        ],
      });
      setIngredients(updated.ingredients);
      setNewItem("");
    } catch (e) {
      Alert.alert(
        "Couldn't price that item",
        e instanceof Error ? e.message : "Unknown error",
      );
    } finally {
      setBusy(false);
    }
  }

  /** Recompute totals from the locally-summed rows. */
  async function save() {
    if (!user) return;
    const totals = sumIngredients(ingredients);
    setSaving(true);
    try {
      const { error } = await supabase.from("logged_meals").insert({
        user_id: user.id,
        title: title.trim() || "Meal",
        source: "gemini",
        ingredients,
        calories: totals.calories,
        protein_g: totals.protein_g,
        carbs_g: totals.carbs_g,
        fat_g: totals.fat_g,
        fiber_g: initial.fiber_g ?? 0,
        sugar_g: initial.sugar_g ?? 0,
        sodium_mg: initial.sodium_mg ?? 0,
        micros: initial.micros ?? {},
        ai_notes: initial.notes ?? null,
      });
      if (error) throw new Error(error.message);
      await Promise.all([refreshDay(), refreshMeals()]);
      onDone();
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="flex-1 bg-white">
      <View
        className="flex-row items-center justify-between border-b border-[#E5E7EB] px-4"
        style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}
      >
        <Pressable onPress={onCancel} hitSlop={12}>
          <Text className="text-base font-semibold text-[#6B7280]">Cancel</Text>
        </Pressable>
        <Text className="text-base font-extrabold text-[#0A0A0F]">Review</Text>
        <Pressable onPress={save} hitSlop={12} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={colors.mint500} />
          ) : (
            <Text className="text-base font-extrabold text-[#00A844]">Save</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          className="mb-4 text-2xl font-extrabold text-[#0A0A0F]"
          placeholder="Meal name"
          placeholderTextColor="#9CA3AF"
        />

        {/* Calories are the headline number, so they lead the screen rather
            than sitting inside the breakdown card below. */}
        <View className="mb-5 overflow-hidden rounded-3xl border border-[#E5E7EB] bg-white">
          <View className="items-center bg-[#E8FBF0] px-5 py-5">
            <Text className="text-[11px] font-extrabold uppercase tracking-[2px] text-[#0A4A24]">
              Calories
            </Text>
            <Text
              className="mt-0.5 font-extrabold text-[#0A0A0F]"
              style={{ fontSize: Math.min(72, Math.max(44, vw * 0.19)) }}
            >
              {Math.round(kcal)}
            </Text>
            <Text className="mt-0.5 text-xs font-semibold text-[#6B7280]">kcal logged</Text>
          </View>
          <View className="flex-row border-t border-[#E5E7EB]">
            {[
              { label: "Protein", value: local.protein_g, tint: "#DC2626" },
              { label: "Carbs", value: local.carbs_g, tint: "#2563EB" },
              { label: "Fat", value: local.fat_g, tint: "#D97706" },
            ].map((m, i) => (
              <View
                key={m.label}
                className="flex-1 items-center py-3"
                style={i > 0 ? { borderLeftWidth: 1, borderLeftColor: "#E5E7EB" } : undefined}
              >
                <Text
                  className="text-lg font-extrabold"
                  style={{ color: m.tint }}
                >
                  {Math.round(m.value)}g
                </Text>
                <Text className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  {m.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {issues.length ? (
          <View className="mb-5 rounded-2xl border-2 border-[#DC2626] bg-red-50 px-4 py-3.5">
            <Text className="text-xs font-extrabold uppercase tracking-widest text-[#DC2626]">
              These numbers look wrong
            </Text>
            {issues.map((iss, i) => (
              <Text
                key={i}
                className="mt-1.5 text-xs leading-4 text-[#991B1B]"
              >
                • {iss.message}
              </Text>
            ))}
          </View>
        ) : null}

        <NutritionBreakdown meal={mealForDisplay} ingredients={ingredients} />

        <Text className="mb-3 text-xs font-bold uppercase tracking-widest text-[#6B7280]">
          Identified items
        </Text>

        {ingredients.length > 0 ? (
          <Pressable
            onPress={runVerification}
            disabled={verifying}
            className="mb-3 flex-row items-center self-start rounded-full border border-[#00C853] px-4 py-2 active:opacity-70"
          >
            {verifying ? (
              <ActivityIndicator color={colors.mint500} size="small" />
            ) : (
              <Text className="text-xs font-bold text-[#00A844]">
                Verify with USDA / Open Food Facts
              </Text>
            )}
          </Pressable>
        ) : null}

        {ingredients.length === 0 ? (
          <Text className="mb-4 text-sm text-[#6B7280]">
            Nothing detected. Add items below.
          </Text>
        ) : (
          <View className="mb-4 gap-2.5">
            {ingredients.map((ing, i) => (
              <View
                key={`${ing.name}-${i}`}
                className="flex-row items-center rounded-2xl border border-[#E5E7EB] px-4 py-3.5"
              >
                <View className="flex-1 pr-3">
                  <Text className="flex-1 font-bold text-[#0A0A0F]" numberOfLines={2}>{ing.name}</Text>
                  <Text className="mt-0.5 text-xs text-[#6B7280]">
                    {nfWhole.format(ing.quantity_g)}g · P{nfWhole.format(ing.protein_g)} C
                    {nfWhole.format(ing.carbs_g)} F{nfWhole.format(ing.fat_g)}
                  </Text>
                  {hasBone(ing) ? (
                    <Text className="mt-0.5 text-[11px] font-semibold text-[#B45309]">
                      {nfWhole.format(ing.quantity_g - edibleWeight(ing))}g bone deducted ·{" "}
                      {nfWhole.format(edibleWeight(ing))}g meat priced
                    </Text>
                  ) : null}
                  {verified[i] ? (
                    <Text className="mt-0.5 text-[11px] font-semibold text-[#00A844]" numberOfLines={1}>
                      verified: {verified[i]}
                    </Text>
                  ) : null}
                </View>
                <Pressable onPress={() => verifyOne(i)} hitSlop={8} className="mr-2 px-1">
                  <Text className="text-[11px] font-bold text-[#00A844]">
                    {verifying ? "…" : "check"}
                  </Text>
                </Pressable>
                <Text className="mr-3 text-base font-extrabold text-[#0A4A24]">
                  {nfWhole.format(ing.calories)}
                </Text>
                <Pressable onPress={() => removeAt(i)} hitSlop={10}>
                  <Text className="text-xl font-light text-[#9CA3AF]">×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* add wrapper */}
        <View className="mb-6 flex-row items-center gap-2">
          <TextInput
            value={newItem}
            onChangeText={setNewItem}
            placeholder="Add something the scan missed…"
            placeholderTextColor="#9CA3AF"
            onSubmitEditing={addIngredient}
            returnKeyType="done"
            className="flex-1 rounded-2xl border border-[#E5E7EB] px-4 py-3.5 text-base text-[#0A0A0F]"
          />
          <Pressable
            onPress={addIngredient}
            disabled={busy}
            className="h-14 w-14 items-center justify-center rounded-2xl bg-[#0A4A24] active:opacity-80"
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text className="text-2xl font-bold text-white">+</Text>
            )}
          </Pressable>
        </View>

        {/* running total */}
        <View className="rounded-3xl bg-[#E8FBF0] p-5">
          <Text className="text-xs font-bold uppercase tracking-widest text-[#0A4A24]">
            New totals
          </Text>
          <Text className="mt-1 text-3xl font-extrabold text-[#0A4A24]">
            {nfWhole.format(kcal)} <Text className="text-base font-bold">kcal</Text>
          </Text>
          <View className="mt-3 flex-row gap-5">
            <Text className="text-sm font-semibold text-[#0A4A24]">
              P {nfWhole.format(local.protein_g)}g
            </Text>
            <Text className="text-sm font-semibold text-[#0A4A24]">
              C {nfWhole.format(local.carbs_g)}g
            </Text>
            <Text className="text-sm font-semibold text-[#0A4A24]">
              F {nfWhole.format(local.fat_g)}g
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

