// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useRouter } from 'expo-router';
import {
  ChevronDown,
  ListOrdered,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PLAY_MODE_LABELS, type PlayMode } from '@/domain/model/playback';
import {
  clearError,
  next,
  previous,
  seekTo,
  setPlayMode,
  togglePlayPause,
} from '@/playback/player';
import { usePlayback } from '@/playback/use-playback';
import { Artwork } from '@/ui/artwork';
import { Slider } from '@/ui/slider';
import { AppText } from '@/ui/text';
import { Colors, SCREEN_PADDING } from '@/ui/theme';
import { formatDuration } from '@/ui/track-row';

/** 播放模式按固定次序轮换，与设计稿上 shuffle / repeat 两枚图标的语义对应。 */
const MODE_CYCLE: PlayMode[] = ['sequential', 'loopAll', 'loopOne', 'shuffle'];

export default function PlayerScreen() {
  const playback = usePlayback();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const track = playback.currentTrack;

  // 拖动期间用本地值，否则每 500ms 的状态回调会把滑块拽回实际播放位置。
  // 值与曲目 id 绑定：切歌后旧的拖动位置自动失效，不需要用 effect 去清——
  // 一个只属于某首曲目的临时值，本就不该在切歌后还存在。
  const [scrub, setScrub] = useState<{ trackId: string; positionMs: number } | null>(null);
  const scrubbing = scrub && scrub.trackId === track?.id ? scrub.positionMs : null;

  const artworkSize = width - SCREEN_PADDING * 2 - 4;
  const position = scrubbing ?? playback.positionMs;
  const duration = playback.durationMs;

  const cycleMode = () => {
    const index = MODE_CYCLE.indexOf(playback.playMode);
    const nextMode = MODE_CYCLE[(index + 1) % MODE_CYCLE.length];
    if (nextMode) void setPlayMode(nextMode);
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.bg,
        paddingTop: insets.top + 6,
        paddingHorizontal: 22,
        paddingBottom: insets.bottom + 26,
        gap: 26,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ChevronDown size={24} color={Colors.text} />
        </Pressable>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <AppText size={10} color={Colors.textMuted}>
            正在播放
          </AppText>
          <AppText size={12} weight="semibold">
            {playback.queue.length > 0
              ? `第 ${playback.currentIndex + 1} / ${playback.queue.length} 首`
              : '播放队列为空'}
          </AppText>
        </View>
        <Pressable onPress={() => router.push('/queue')} hitSlop={10}>
          <ListOrdered size={22} color={Colors.text} />
        </Pressable>
      </View>

      <Artwork uri={track?.artworkUri ?? null} size={artworkSize} radius={26} />

      <View style={{ gap: 5 }}>
        <AppText size={25} weight="bold" numberOfLines={2}>
          {track?.title ?? '未在播放'}
        </AppText>
        <AppText size={13} color={Colors.textMuted} numberOfLines={1}>
          {track ? (track.artist ?? '未知艺术家') : '从曲库或歌单选一首开始'}
        </AppText>
      </View>

      <View style={{ gap: 9 }}>
        <Slider
          value={position}
          max={duration}
          onScrub={(value) => {
            if (track) setScrub({ trackId: track.id, positionMs: value });
          }}
          onCommit={(value) => {
            setScrub(null);
            void seekTo(value);
          }}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText size={11} color={Colors.textMuted}>
            {formatDuration(position)}
          </AppText>
          <AppText size={11} color={Colors.textMuted}>
            {duration > 0 ? `-${formatDuration(Math.max(duration - position, 0))}` : '--:--'}
          </AppText>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 2,
        }}
      >
        <Pressable onPress={cycleMode} hitSlop={10}>
          <ModeIcon mode={playback.playMode} />
        </Pressable>
        <Pressable onPress={() => void previous()} hitSlop={10}>
          <SkipBack size={30} color={Colors.text} fill={Colors.text} />
        </Pressable>
        <Pressable
          onPress={() => void togglePlayPause()}
          style={{
            width: 74,
            height: 74,
            borderRadius: 37,
            backgroundColor: Colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {playback.state === 'playing' ? (
            <Pause size={28} color={Colors.bg} fill={Colors.bg} />
          ) : (
            <Play size={28} color={Colors.bg} fill={Colors.bg} />
          )}
        </Pressable>
        <Pressable onPress={() => void next()} hitSlop={10}>
          <SkipForward size={30} color={Colors.text} fill={Colors.text} />
        </Pressable>
        <Pressable onPress={cycleMode} hitSlop={10}>
          <AppText size={11} weight="medium" color={Colors.textMuted}>
            {PLAY_MODE_LABELS[playback.playMode]}
          </AppText>
        </Pressable>
      </View>

      {playback.error ? (
        // 点一下即消。失败原因必须让用户看见（spec 要求），但看过之后
        // 不该一直占着播放器页——它会在下一次成功装载时自动清空，用户也能主动关掉。
        <Pressable
          onPress={clearError}
          style={{
            borderRadius: 18,
            backgroundColor: Colors.surface,
            paddingVertical: 16,
            paddingHorizontal: 18,
            gap: 4,
          }}
        >
          <AppText size={13} color="#FF6B6B">
            {playback.error}
          </AppText>
          <AppText size={11} color={Colors.textMuted}>
            点击关闭
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function ModeIcon({ mode }: { mode: PlayMode }) {
  if (mode === 'shuffle') return <Shuffle size={20} color={Colors.accent} />;
  if (mode === 'loopOne') return <Repeat1 size={20} color={Colors.accent} />;
  if (mode === 'loopAll') return <Repeat size={20} color={Colors.accent} />;
  return <Repeat size={20} color={Colors.textMuted} />;
}
