// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useRouter } from 'expo-router';
import { Pause, Play, SkipForward } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { next, togglePlayPause } from '@/playback/player';
import { usePlayback } from '@/playback/use-playback';
import { Artwork } from '@/ui/artwork';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';

/** 设计稿 Mini Player：封面 42 + 曲目信息 + 播放/下一首，整体 8/12 内距、18 圆角。 */
export function MiniPlayer() {
  const playback = usePlayback();
  const router = useRouter();

  if (!playback.currentTrack) return null;

  return (
    <Pressable
      onPress={() => router.push('/player')}
      style={{
        borderRadius: 18,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.cardBorder,
        paddingVertical: 8,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Artwork uri={playback.currentTrack.artworkUri} width={42} height={42} radius={11} />
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
  );
}

/**
 * 栈内页面（歌单详情、播放队列）用的悬浮迷你播放器。
 *
 * 设计稿的歌单详情底部有迷你播放器但没有标签栏——离开标签页不该同时失去播放控制。
 * 标签页里的那一份由 BottomDock 与标签栏叠在一起排布，因此这里只补一个定位外壳。
 */
export function FloatingMiniPlayer() {
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
      }}
    >
      <MiniPlayer />
    </View>
  );
}
