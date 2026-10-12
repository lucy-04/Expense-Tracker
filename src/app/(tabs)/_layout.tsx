import { Tabs } from 'expo-router/js-tabs';

import { AppTabBar } from '@/components/tab-bar';

// A custom JS tab bar instead of the stock Android one, so the bar can carry the
// app's own icons and selected-tab style. Tab switches are instant (no animation).
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false, animation: 'none' }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Payments' }} />
      <Tabs.Screen name="import" options={{ title: 'Import' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
