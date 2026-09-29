import "./global.css";

import React from "react";
import { NavigationContainer, type LinkingOptions } from "@react-navigation/native";
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
import { colors } from "./src/theme";
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
    },
  },
};

function Tabs() {
  // Android 15+ forces edge-to-edge, so the system nav bar draws OVER app
  // content. Without adding the bottom inset here, the tab bar ends up
  // underneath the back/home/recents buttons.
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
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
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" size={size} color={color} />
          ),
        }}
      >
        {({ navigation }) => (
          <DashboardScreen
            onScan={() => navigation.navigate("Scan" as never)}
            onOpenMeal={(meal) => navigation.navigate("MealDetail", { meal })}
          />
        )}
      </Tab.Screen>
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
  const [draft, setDraft] = React.useState<ParsedMeal | null>(null);

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
            onResult={(meal) => {
              setDraft(meal);
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
              initial={draft}
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
