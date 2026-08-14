// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { BlurView } from 'expo-blur';
import { House, LibraryBig, Search, UserRound } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniPlayer } from '@/ui/mini-player';
import { AppText } from '@/ui/text';
import { Colors, DOCK_HEIGHT } from '@/ui/theme';

/**
 * 标签页里的列表底部要留出的余量。
 *
 * `DOCK_HEIGHT` 只是 Dock 自身的高度，而 Dock 是 `position: absolute` 压在内容之上、
 * 并额外垫了 `12 + insets.bottom`。手势导航的设备上 `insets.bottom` 有近 20dp，
 * 静态常量因此**总是短这一截**——列表滚到底时最后一行会被 Dock 盖住，看起来像是划不动了。
 * 实测这台 1080×2400 的设备：Dock 实占 156dp，常量 138dp，差的正是导航条。
 *
 * 顺带一提，没有曲目在播时迷你播放器整个不渲染，Dock 会矮 68dp，此时这个余量偏大。
 * 不去修正它——多留一点是白边，少留一点是遮挡，两者代价不对等。
 */
export function useDockInset(): number {
  return DOCK_HEIGHT + useSafeAreaInsets().bottom;
}

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
