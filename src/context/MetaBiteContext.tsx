import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { DailyTotals, LoggedMeal, Profile } from "../lib/types";

interface Ctx {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  totals: DailyTotals | null;
  meals: LoggedMeal[];
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  refreshDay: (day?: string) => Promise<void>;
  refreshMeals: () => Promise<void>;
}

const MetaBiteContext = createContext<Ctx | null>(null);

export function useMetaBite() {
  const ctx = useContext(MetaBiteContext);
  if (!ctx) throw new Error("useMetaBite must be used inside <MetaBiteProvider>");
  return ctx;
}

/**
 * The day boundary. Must match public.app_day() in Postgres or meals will be
 * filed under a different date than the dashboard aggregates. Asia/Karachi is a
 * fixed UTC+5 with no DST, so the reset is exactly 00:00 local.
 */
import { APP_TIMEZONE, todayKey } from "../lib/dates";

export { APP_TIMEZONE };

// The formatter is module-cached in ./dates, so this is a cheap call on every
// refresh rather than a new Intl construction each time.
const today = todayKey;

export function MetaBiteProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [totals, setTotals] = useState<DailyTotals | null>(null);
  const [meals, setMeals] = useState<LoggedMeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      if (!data.session) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null);
      if (!next) {
        setProfile(null);
        setTotals(null);
        setMeals([]);
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      // A profile row is created by the auth.users trigger; if it has not
      // landed yet, retry once before surfacing an error. Kept short because
      // this sits on the cold-start path and the user is watching a splash.
      await new Promise((r) => setTimeout(r, 350));
      const retry = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      setProfile(retry.data ?? null);
      return (retry.data as Profile) ?? null;
    }
    setProfile(data as Profile);
    return data as Profile;
  }, []);

  const refreshDay = useCallback(async (day?: string) => {
    const d = day ?? today();
    const { data } = await supabase.rpc("daily_totals", { target_day: d });
    const row = Array.isArray(data) ? data[0] : data;
    // The RPC is total and always returns one zero-filled row, but never leave
    // the previous day's totals in state on the off chance it does not: that
    // would show yesterday's calories on a day with nothing logged.
    if (!row) {
      setTotals({
        eaten_on: d,
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 0,
        sodium_mg: 0,
        meal_count: 0,
      });
      return;
    }
    setTotals({
      eaten_on: row.eaten_on,
      calories: Number(row.calories ?? 0),
      protein_g: Number(row.protein_g ?? 0),
      carbs_g: Number(row.carbs_g ?? 0),
      fat_g: Number(row.fat_g ?? 0),
      fiber_g: Number(row.fiber_g ?? 0),
      sugar_g: Number(row.sugar_g ?? 0),
      sodium_mg: Number(row.sodium_mg ?? 0),
      meal_count: Number(row.meal_count ?? 0),
    });
  }, []);

  const refreshMeals = useCallback(async () => {
    const { data } = await supabase
      .from("logged_meals")
      .select("*")
      .eq("eaten_on", today())
      .order("logged_at", { ascending: false });
    setMeals((data ?? []) as LoggedMeal[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session?.user) return;
      setLoading(true);
      const loaded = await loadProfile(session.user.id);
      if (cancelled) return;
      // An account that has not finished onboarding has no meals to total up.
      // Firing both reads anyway costs two round trips before the user can
      // reach the onboarding screen, which is the very first thing a new user
      // sees after signing up.
      if (loaded?.onboarded_at) {
        await Promise.all([refreshDay(), refreshMeals()]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, loadProfile, refreshDay, refreshMeals]);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    return { needsConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const updateProfile = useCallback(async (patch: Partial<Profile>) => {
    if (!session?.user) return;
    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", session.user.id);
    if (error) throw new Error(error.message);
    await loadProfile(session.user.id);
  }, [session?.user?.id, loadProfile]);

  const value = useMemo<Ctx>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      totals,
      meals,
      loading,
      signUp,
      signIn,
      signOut,
      updateProfile,
      refreshDay,
      refreshMeals,
    }),
    [
      session,
      profile,
      totals,
      meals,
      loading,
      signUp,
      signIn,
      signOut,
      updateProfile,
      refreshDay,
      refreshMeals,
    ],
  );

  return <MetaBiteContext.Provider value={value}>{children}</MetaBiteContext.Provider>;
}
