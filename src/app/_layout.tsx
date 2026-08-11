// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initPlayback } from '@/playback/player';
import { Plugins } from '@/plugins';
import { Colors } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    // 播放服务在应用启动时初始化：音频会话配置与锁屏注册要早于任何播放动作，
    // 等到用户点播放再配置会错过第一首曲目的媒体会话。
    void initPlayback();
  }, []);

  useEffect(() => {
    // 已安装的插件在启动时统一加载并注册为来源，否则用户点开一首插件曲目时，
    // 它归属的来源还不在注册表里，会被当成「来源不可用」。
    // iOS 上这是一个空实现，不引入任何插件代码（design.md 决策 6）。
    void Plugins.init();
  }, []);

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="player"
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="queue" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
