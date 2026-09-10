// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import type { Track } from '@/domain/model/track';
import type { LyricLine, Lyrics } from '@/lyrics/model';
import { useLyrics, useLyricsDirectory } from '@/lyrics/store';
import { usePlayback } from '@/playback/use-playback';
import { Plugins } from '@/plugins';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';

/**
 * 播放页的歌词区。
 *
 * 组件自己订阅播放状态与歌词，不向页面要任何东西：当前曲目与播放位置都在播放层的
 * 快照里，歌词由 `useLyrics` 按曲目取——播放层一行不改（design.md 决策 7）。
 *
 * 三种情形共用同一张卡片的外形，只换内容：有时间轴的逐行高亮并跟随播放；纯文本照常
 * 显示不跟随；没找到时说明可以怎么补。卡片高度固定，歌词在卡片内滚动——全屏歌词页
 * 不在本次范围（proposal 非目标）。
 */

/** 歌词区的可视高度。约七行，够看清「现在唱到哪」与上下文，又不把控制区推出首屏。 */
const CARD_HEIGHT = 224;
const LINE_HEIGHT = 24;
const LINE_GAP = 8;
const PADDING_V = 16;

export function LyricsCard() {
  const playback = usePlayback();
  const track = playback.currentTrack;
  const state = useLyrics(track);
  const directoryUri = useLyricsDirectory();

  if (!track) return null;

  if (state.status === 'loading') {
    return (
      <Card>
        <AppText size={13} color={Colors.textMuted}>
          正在查找歌词…
        </AppText>
      </Card>
    );
  }

  if (state.status === 'not-found') {
    return (
      <Card>
        <AppText size={15} weight="semibold" color={Colors.accent}>
          没有找到歌词
        </AppText>
        <AppText size={13} color={Colors.textMuted} lineHeight={20}>
          {notFoundHint(track, state.unreadableFile, directoryUri !== null)}
        </AppText>
      </Card>
    );
  }

  return (
    <Card fixedHeight>
      {/* 按曲目重挂载：行的布局位置是按下标记的，换了歌词不能沿用上一首的 */}
      <LyricsBody key={track.id} lyrics={state.lyrics} positionMs={playback.positionMs} />
    </Card>
  );
}

/**
 * 「可以怎么补」的说明要说到用户能动手的那一步（lyrics-display spec：不是只留一句
 * 无从下手的提示）。读不出的文件优先说——用户明明放了文件，先解释为什么没用上。
 */
function notFoundHint(track: Track, unreadableFile: string | null, hasDirectory: boolean): string {
  if (unreadableFile) {
    return `歌词目录里的「${unreadableFile}」不是 UTF-8 编码，无法读取。用文本编辑器将它另存为 UTF-8 后即可显示。`;
  }

  const fileHint = hasDirectory
    ? `把「${track.title}.lrc」放进歌词目录即可显示。`
    : `在「我的」页指定歌词目录，放入「${track.title}.lrc」即可显示。`;

  // 插件歌词只在具备插件能力的平台上提；iOS 上这句话指向一个不存在的入口。
  // 装了歌词类插件却没搜到时，说「按标题没有搜到」而不是「安装后会自动查找」——
  // 后者会让用户去装一个已经装了的东西。
  if (!Plugins.supported) return fileHint;
  return Plugins.hasLyricPlugins()
    ? `已安装的歌词插件按这个标题没有搜到。${fileHint}`
    : `${fileHint}安装歌词类插件后，也会按标题自动查找。`;
}

function Card({ children, fixedHeight = false }: { children: ReactNode; fixedHeight?: boolean }) {
  return (
    <View
      style={{
        borderRadius: 18,
        backgroundColor: Colors.surface,
        paddingVertical: fixedHeight ? 0 : PADDING_V,
        paddingHorizontal: 18,
        gap: 8,
        ...(fixedHeight ? { height: CARD_HEIGHT, overflow: 'hidden' as const } : null),
      }}
    >
      {children}
    </View>
  );
}

function LyricsBody({ lyrics, positionMs }: { lyrics: Lyrics; positionMs: number }) {
  if (lyrics.kind === 'plain') {
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: PADDING_V }}
        nestedScrollEnabled
      >
        <AppText size={15} lineHeight={LINE_HEIGHT}>
          {lyrics.text}
        </AppText>
      </ScrollView>
    );
  }
  return <SyncedLines lines={lyrics.lines} positionMs={positionMs} />;
}

/**
 * 带时间轴的行序列：当前行高亮，并把它滚到卡片中部。
 *
 * 当前行的判定是「最后一个开始时刻不晚于播放位置的行」，拖动进度后播放位置一变，
 * 这个判定自然给出新的行——不需要为拖动单独处理。播放位置约每 500ms 更新一次，
 * 对逐行足够（一行歌词通常持续数秒）。
 */
function SyncedLines({ lines, positionMs }: { lines: readonly LyricLine[]; positionMs: number }) {
  const scrollRef = useRef<ScrollView>(null);
  // 每行的纵向位置由布局回调给出，而不是按固定行高推算：长句会折成两行。
  const [offsets, setOffsets] = useState<number[]>([]);
  const activeIndex = currentLineIndex(lines, positionMs);

  useEffect(() => {
    const offset = offsets[activeIndex];
    if (offset === undefined) return;
    scrollRef.current?.scrollTo({
      y: Math.max(0, offset - (CARD_HEIGHT - LINE_HEIGHT) / 2),
      animated: true,
    });
  }, [activeIndex, offsets]);

  return (
    <ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      // 首尾各留半张卡片的余量，让第一行与最后一行也能停在卡片中部。
      contentContainerStyle={{ paddingVertical: CARD_HEIGHT / 2 - LINE_HEIGHT / 2, gap: LINE_GAP }}
      nestedScrollEnabled
    >
      {lines.map((line, index) => (
        <View
          key={`${line.timeMs}-${index}`}
          onLayout={(event) => {
            const y = event.nativeEvent.layout.y;
            setOffsets((previous) => {
              if (previous[index] === y) return previous;
              const next = previous.slice();
              next[index] = y;
              return next;
            });
          }}
        >
          <AppText
            size={15}
            lineHeight={LINE_HEIGHT}
            weight={index === activeIndex ? 'semibold' : 'regular'}
            color={index === activeIndex ? Colors.accent : Colors.textMuted}
          >
            {line.text || '♪'}
          </AppText>
        </View>
      ))}
    </ScrollView>
  );
}

/** 行已按时间排序，二分找最后一个 `timeMs <= positionMs` 的行；位置早于首行时取首行。 */
function currentLineIndex(lines: readonly LyricLine[], positionMs: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((lines[middle]?.timeMs ?? 0) <= positionMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}
