// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { ListMusic, LibraryBig, ListOrdered, Pause, Play, SkipForward } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { next, togglePlayPause } from '@/playback/player';
import { usePlayback } from '@/playback/use-playback';
import { Artwork } from '@/ui/artwork';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';

const TAB_ICONS = { index: LibraryBig, playlists: ListMusic, queue: ListOrdered } as const;
const TAB_LABELS = { index: '曲库', playlists: '歌单', queue: '播放队列' } as const;

type TabName = keyof typeof TAB_ICONS;

/**
 * `Tabs` 的 `tabBar` 会传入完整的导航上下文，这里只声明实际用到的部分。
 * 不从 `expo-router/build/...` 里拿类型——那是包的内部路径，升级时会断。
 */
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

/**
 * 设计稿的 Bottom Dock：迷你播放器与标签栏叠成一组悬浮在内容之上。
 *
 * 标签栏的目的地按 C1 的实际能力取——设计稿画的是「发现 / 搜索 / 音乐库 / 我的」，
 * 但本产品不提供音源，「发现」没有内容可发现；搜索属于曲库页内部的能力而非独立
 * 目的地。视觉规格（尺寸、圆角、模糊、描边、字号）逐值照搬设计稿。
 */
export function BottomDock({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const playback = usePlayback();
  const router = useRouter();

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
      {playback.currentTrack ? (
        <Pressable
          onPress={() => router.push('/player')}
          style={{
            height: 58,
            borderRadius: 18,
            backgroundColor: Colors.surface,
            paddingVertical: 8,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Artwork uri={playback.currentTrack.artworkUri} size={42} radius={11} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText size={13} weight="semibold" numberOfLines={1}>
              {playback.currentTrack.title}
            </AppText>
            <AppText size={11} color={Colors.textMuted} numberOfLines={1}>
              {playback.state === 'buffering'
                ? '缓冲中…'
                : (playback.currentTrack.artist ?? '未知艺术家')}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingRight: 4 }}>
            <Pressable onPress={() => void togglePlayPause()} hitSlop={8}>
              {playback.state === 'playing' ? (
                <Pause size={19} color={Colors.text} fill={Colors.text} />
              ) : (
                <Play size={19} color={Colors.text} fill={Colors.text} />
              )}
            </Pressable>
            <Pressable onPress={() => void next()} hitSlop={8}>
              <SkipForward size={19} color={Colors.text} fill={Colors.text} />
            </Pressable>
          </View>
        </Pressable>
      ) : null}

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
              <AppText size={10} weight="medium" color={color}>
                {TAB_LABELS[name]}
              </AppText>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}
