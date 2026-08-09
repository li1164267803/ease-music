// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useRouter } from 'expo-router';
import {
  ChevronDown,
  Ellipsis,
  Heart,
  ListMusic,
  MicVocal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PlayMode } from '@/domain/model/playback';
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
import { formatDuration } from '@/ui/format';
import { Slider } from '@/ui/slider';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';

/** 设计稿 Content 的左右内边距，比其余页面宽 2。 */
const PLAYER_PADDING = 22;

export default function PlayerScreen() {
  const playback = usePlayback();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const track = playback.currentTrack;

  // 拖动期间用本地值，否则每 500ms 的状态回调会把滑块拽回实际播放位置。
  // 值与曲目 id 绑定：切歌后旧的拖动位置自动失效，不需要用 effect 去清——
  // 一个只属于某首曲目的临时值，本就不该在切歌后还存在。
  const [scrub, setScrub] = useState<{ trackId: string; positionMs: number } | null>(null);
  const scrubbing = scrub && scrub.trackId === track?.id ? scrub.positionMs : null;

  const position = scrubbing ?? playback.positionMs;
  const duration = playback.durationMs;
  const shuffling = playback.playMode === 'shuffle';

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.bg,
        paddingTop: insets.top + 6,
      }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          gap: 26,
          paddingHorizontal: PLAYER_PADDING,
          paddingBottom: insets.bottom + 26,
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <ChevronDown size={24} color={Colors.text} />
          </Pressable>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <AppText size={10} color={Colors.textMuted} letterSpacing={0.8}>
              正在播放来自
            </AppText>
            <AppText size={12} weight="semibold">
              {playback.queue.length > 0
                ? `播放队列 · 第 ${playback.currentIndex + 1} / ${playback.queue.length} 首`
                : '播放队列为空'}
            </AppText>
          </View>
          {/* 曲目菜单尚无入口内容，先渲染出设计稿的位置 */}
          <Ellipsis size={24} color={Colors.text} />
        </View>

        <Artwork uri={track?.artworkUri ?? null} width="100%" height={330} radius={26} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ flex: 1, gap: 5 }}>
            <AppText size={25} weight="bold" letterSpacing={-0.4} numberOfLines={2}>
              {track?.title ?? '未在播放'}
            </AppText>
            <AppText size={13} color={Colors.textMuted} numberOfLines={1}>
              {track ? subtitle(track.artist, track.album) : '从曲库或歌单选一首开始'}
            </AppText>
          </View>
          {/* 收藏依赖 C2 之后的曲库字段，这里只呈现设计稿的位置 */}
          <Heart size={24} color={Colors.accent} />
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
          {/*
            设计稿把随机与循环画成两枚独立图标，因此这里也拆成两个动作：随机是开关，
            循环在「顺序 → 列表循环 → 单曲循环」之间轮换。四种播放模式仍是同一组，
            只是不再挤在一个按钮上轮播——那样用户无法直接切到想要的模式。
          */}
          <Pressable
            onPress={() => void setPlayMode(shuffling ? 'sequential' : 'shuffle')}
            hitSlop={10}
          >
            <Shuffle size={20} color={shuffling ? Colors.accent : Colors.textMuted} />
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
              shadowColor: Colors.accent,
              shadowOpacity: 0.25,
              shadowRadius: 13,
              shadowOffset: { width: 0, height: 10 },
              elevation: 10,
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
          <Pressable
            onPress={() => void setPlayMode(nextRepeatMode(playback.playMode))}
            hitSlop={10}
          >
            <RepeatIcon mode={playback.playMode} />
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
            <AppText size={13} color={Colors.danger}>
              {playback.error}
            </AppText>
            <AppText size={11} color={Colors.textMuted}>
              点击关闭
            </AppText>
          </Pressable>
        ) : (
          <View
            style={{
              borderRadius: 18,
              backgroundColor: Colors.surface,
              paddingVertical: 16,
              paddingHorizontal: 18,
              gap: 8,
            }}
          >
            {/* 歌词是 C3 的能力，卡片先按设计稿占位，说明清楚而不是留一段假歌词 */}
            <AppText size={15} weight="semibold" color={Colors.accent}>
              暂无歌词
            </AppText>
            <AppText size={15} color={Colors.textMuted}>
              本地 .lrc 与内嵌歌词将在后续版本支持
            </AppText>
          </View>
        )}

        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          {/*
            音质标记按设计稿呈现。来源层目前不返回采样率与位深，这枚标签还没有数据
            支撑——真实音质要等 C2 缓存元数据落地后才能填进来。
          */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              borderRadius: 13,
              backgroundColor: Colors.surface,
              paddingVertical: 6,
              paddingHorizontal: 12,
            }}
          >
            <View
              style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent }}
            />
            <AppText size={11} weight="medium">
              Hi-Res 无损
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <MicVocal size={20} color={Colors.textMuted} />
            <Pressable onPress={() => router.push('/queue')} hitSlop={10}>
              <ListMusic size={20} color={Colors.textMuted} />
            </Pressable>
            <Share2 size={20} color={Colors.textMuted} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function subtitle(artist: string | null, album: string | null): string {
  const name = artist ?? '未知艺术家';
  return album ? `${name} · ${album}` : name;
}

/** 循环按钮只在三种「非随机」模式间轮换；随机由左侧那枚图标单独负责。 */
function nextRepeatMode(mode: PlayMode): PlayMode {
  if (mode === 'sequential') return 'loopAll';
  if (mode === 'loopAll') return 'loopOne';
  return 'sequential';
}

function RepeatIcon({ mode }: { mode: PlayMode }) {
  if (mode === 'loopOne') return <Repeat1 size={20} color={Colors.accent} />;
  if (mode === 'loopAll') return <Repeat size={20} color={Colors.accent} />;
  return <Repeat size={20} color={Colors.textMuted} />;
}
