import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMetaBite } from "../context/MetaBiteContext";

export function AuthScreen() {
  const { signIn, signUp } = useMetaBite();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError("Enter an email and a password.");
      return;
    }
    if (mode === "up" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "in") {
        await signIn(email.trim(), password);
      } else {
        const { needsConfirmation } = await signUp(email.trim(), password);
        if (needsConfirmation) {
          setNotice(
            "Check your inbox and click the confirmation link, then sign in.",
          );
          setMode("in");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-white"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingTop: insets.top + 24, paddingBottom: 24 }}>
          <Text className="text-4xl font-extrabold text-[#0A0A0F]">
            Meta<Text className="text-[#00C853]">Bite</Text>
          </Text>
          <Text className="mt-2 text-base text-[#6B7280]">
            Point your camera at a meal. Get the macros back in seconds.
          </Text>
        </View>

        <View className="mb-6 flex-row rounded-2xl bg-[#F3F4F6] p-1">
          {(["in", "up"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => {
                setMode(m);
                setError(null);
                setNotice(null);
              }}
              className={`flex-1 items-center rounded-xl py-3 ${
                mode === m ? "bg-white" : ""
              }`}
              style={
                mode === m
                  ? { shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 }
                  : undefined
              }
            >
              <Text
                className={`text-sm font-bold ${
                  mode === m ? "text-[#0A4A24]" : "text-[#6B7280]"
                }`}
              >
                {m === "in" ? "Sign in" : "Create account"}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-[#6B7280]">
          Email
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor="#9CA3AF"
          className="mb-4 rounded-2xl border border-[#E5E7EB] px-4 py-4 text-base text-[#0A0A0F]"
        />

        <Text className="mb-2 text-xs font-bold uppercase tracking-widest text-[#6B7280]">
          Password
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder={mode === "up" ? "At least 8 characters" : "••••••••"}
          placeholderTextColor="#9CA3AF"
          className="rounded-2xl border border-[#E5E7EB] px-4 py-4 text-base text-[#0A0A0F]"
        />

        {error ? (
          <View className="mt-4 rounded-2xl bg-red-50 px-4 py-3">
            <Text className="text-sm font-semibold text-[#DC2626]">{error}</Text>
          </View>
        ) : null}
        {notice ? (
          <View className="mt-4 rounded-2xl bg-[#E8FBF0] px-4 py-3">
            <Text className="text-sm font-semibold text-[#0A4A24]">{notice}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={busy}
          className="mt-6 items-center rounded-2xl bg-[#0A4A24] py-4 active:opacity-80"
          style={{ minHeight: 52 }}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-base font-extrabold text-white">
              {mode === "in" ? "Sign in" : "Create account"}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
