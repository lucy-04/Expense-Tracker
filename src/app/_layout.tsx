import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black, useFonts } from '@expo-google-fonts/nunito';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { LockGate } from '@/components/lock-gate';
import { Colors, Fonts } from '@/constants/theme';
import { DATABASE_NAME, migrate } from '@/db/schema';

// Keep the splash up until Nunito is ready, so text never flashes in the fallback font.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const [fontsLoaded, fontError] = useFonts({ Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: colors.background, card: colors.background, text: colors.text, border: colors.tileBorder, primary: colors.primary },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="auto" />
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
        <LockGate>
          <Stack
            screenOptions={{
              headerShadowVisible: false,
              headerTitleStyle: { fontFamily: Fonts.extraBold, fontSize: 18 },
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
            }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            {/* A short task on its own screen: a native bottom sheet with swipe-down to dismiss. */}
            <Stack.Screen
              name="txn/[id]"
              options={{ presentation: 'formSheet', headerShown: false, sheetAllowedDetents: [0.92], sheetElevation: 12 }}
            />
            <Stack.Screen name="sort" options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'slide_from_bottom' }} />
          </Stack>
        </LockGate>
      </SQLiteProvider>
    </ThemeProvider>
  );
}
