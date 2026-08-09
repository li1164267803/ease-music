// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { BlurView } from 'expo-blur';
import { House, LibraryBig, Search, UserRound } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniPlayer } from '@/ui/mini-player';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';

const TAB_ICONS = {
  index: House,
  search: Search,
  library: LibraryBig,
  profile: UserRound,
} as const;
const TAB_LABELS = { index: '发现', search: '搜索', library: '音乐库', profile: '我的' } as const;

type TabName = keyof typeof TAB_ICONS;

/**
 * `Tabs` 的 `tabBar` 会传入完整的导航上下文，这里只声明实际用到的部分。
 * 不从 `expo-router/build/...` 里拿类型——那是包的内部路径，升级时会断。
 */
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

/** 设计稿的 Bottom Dock：迷你播放器与标签栏叠成一组悬浮在内容之上。 */
export function BottomDock({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingBottom: 12 + insets.bottom,
        gap: 8,
      }}
    >
      <MiniPlayer />

      {/* 阴影挂在外层：模糊层本身要 overflow:hidden 裁圆角，阴影画不出来 */}
      <View
        style={{
          borderRadius: 30,
          shadowColor: '#000000',
          shadowOpacity: 0.35,
          shadowRadius: 15,
          shadowOffset: { width: 0, height: 10 },
          elevation: 12,
        }}
      >
        <BlurView
          intensity={24}
          tint="dark"
          style={{
            height: 60,
            borderRadius: 30,
            overflow: 'hidden',
            backgroundColor: Colors.dock,
            borderWidth: 1,
            borderColor: Colors.dockBorder,
            padding: 2,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          {state.routes.map((route, index) => {
            const name = route.name as TabName;
            const Icon = TAB_ICONS[name];
            if (!Icon) return null;

            const focused = state.index === index;
            const color = focused ? Colors.accent : Colors.textMuted;

            return (
              <Pressable
                key={route.key}
                onPress={() => navigation.navigate(route.name)}
                style={{
                  flex: 1,
                  borderRadius: 20,
                  paddingVertical: 7,
                  paddingHorizontal: 16,
                  gap: 3,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: focused ? Colors.accentSoft : 'transparent',
                }}
              >
                <Icon size={21} color={color} />
                <AppText size={10} weight={focused ? 'semibold' : 'medium'} color={color}>
                  {TAB_LABELS[name]}
                </AppText>
              </Pressable>
            );
          })}
        </BlurView>
      </View>
    </View>
  );
}
