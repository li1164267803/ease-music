// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import Tabs from 'expo-router/js-tabs';

import { BottomDock } from '@/ui/bottom-dock';
import { Colors } from '@/ui/theme';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <BottomDock {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: Colors.bg } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
