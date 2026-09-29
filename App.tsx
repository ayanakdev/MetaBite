import "./global.css";

import React from "react";
import { NavigationContainer, useNavigation, type LinkingOptions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";

import { MetaBiteProvider, useMetaBite } from "./src/context/MetaBiteContext";
import { BrandSplash } from "./src/screens/BrandSplash";
import { AuthScreen } from "./src/screens/AuthScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { IngredientEditorScreen } from "./src/screens/IngredientEditorScreen";
import { MealDetailScreen } from "./src/screens/MealDetailScreen";
import { DayDetailScreen } from "./src/screens/DayDetailScreen";
import { colors } from "./src/theme";
import type { Shot } from "./src/lib/imagePrep";
import type { LoggedMeal, ParsedMeal } from "./src/lib/types";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const linking: LinkingOptions<ReactNavigation.RootParamList> = {
  prefixes: [Linking.createURL("/")],
  config: {
    screens: {
      Tabs: { screens: { Dashboard: "dashboard", Settings: "settings" } },
      Scan: "scan",
      Review: "auth/callback",
      MealDetail: "meal/:id",
      DayDetail: "day/:id",
    },
  },
};

/**
 * A stable component for the Dashboard tab.
 *
 * It used to be a function child, which React Navigation re-invokes on every
 * render of the navigator. That re-rendered the whole dashboard - including the
 * Reanimated fluid tank - each time the user moved between tabs. A `component`
 * reference is resolved once, so switching tabs no longer re-renders a screen
 * that is merely sitting in the background.
 */
function DashboardTab() {
  const navigation = useNavigation<any>();
  return (
    <DashboardScreen
      onScan={() => navigation.navigate("Scan" as never)}
      onOpenMeal={(meal) => navigation.navigate("MealDetail", { meal })}
    />
  );
}

function Tabs() {
  // Android 15+ forces edge-to-edge, so the system nav bar draws OVER app
  // content. Without adding the bottom inset here, the tab bar ends up
  // underneath the back/home/recents buttons.
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      /**
       * Stop detaching the tab that is losing focus.
       *
       * react-navigation defaults this to true on Android. Detaching removes the
       * screen from the native view hierarchy, so between the outgoing screen
       * going away and the incoming screen committing its first frame there is
       * genuinely nothing there to draw - and since react-navigation never sets a
       * background on that container, Android composites the gap against the
       * window and you get a black flash on every tab press. It looked like a
       * lag spike because it is roughly one dropped frame long.
       *
       * Three tab screens is a negligible amount of memory to keep mounted, and
       * keeping them mounted also means History and Settings no longer re-run
       * their queries every time you come back to them.
       */
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        /**
         * Rendering with a white scene rather than the default transparent one is
         * the second half of the same fix: if any gap does appear, it is the app's
         * own background instead of a black rectangle.
         */
        sceneStyle: { backgroundColor: colors.surface },
        tabBarActiveTintColor: colors.jade500,
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: "#E5E7EB",
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 8,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardTab}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function Root() {
  const { session, profile, loading } = useMetaBite();
  /**
   * The photo is carried alongside the meal rather than inside ParsedMeal,
   * because that type mirrors the database shape. The whole Shot goes with it,
   * since the file URI is needed to display the photo and the base64 to upload
   * it - re-encoding it from the URI at save time would be wasted work.
   */
  const [draft, setDraft] = React.useState<{ meal: ParsedMeal; photo?: Shot } | null>(null);

  if (loading) {
    return <BrandSplash />;
  }

  if (!session) return <AuthScreen />;
  if (!profile?.onboarded_at) return <OnboardingScreen />;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={Tabs} />
      <Stack.Screen
        name="Scan"
        options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
      >
        {({ navigation }) => (
          <ScanScreen
            onCancel={() => navigation.goBack()}
            onResult={(meal, photo) => {
              setDraft({ meal, photo });
              navigation.navigate("Review");
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="Review"
        options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
      >
        {({ navigation }) =>
          draft ? (
            <IngredientEditorScreen
              initial={draft.meal}
              photo={draft.photo}
              onDone={() => {
                // Saving should feel like "logged", so land on the dashboard
                // rather than dropping the user back into the camera they just
                // used. popToTop unwinds Scan and Review together.
                navigation.popToTop();
              }}
              onCancel={() => navigation.goBack()}
            />
          ) : null
        }
      </Stack.Screen>
      <Stack.Screen
        name="MealDetail"
        options={{ animation: "slide_from_right" }}
      >
        {({ navigation, route }) => (
          <MealDetailScreen
            meal={(route.params as { meal: LoggedMeal }).meal}
            onBack={() => navigation.goBack()}
          />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="DayDetail"
        options={{ animation: "slide_from_right" }}
      >
        {({ navigation, route }) => (
          <DayDetailScreen
            day={(route.params as { day: string }).day}
            onBack={() => navigation.goBack()}
            onOpenMeal={(meal) => navigation.navigate("MealDetail", { meal })}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MetaBiteProvider>
        <NavigationContainer linking={linking}>
          <Root />
        </NavigationContainer>
      </MetaBiteProvider>
    </SafeAreaProvider>
  );
}
