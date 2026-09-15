// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { AudioLines, EllipsisVertical } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { DownloadButton } from '@/cache/ui/download-button';
import type { Track } from '@/domain/model/track';
import { useIsCurrentTrack } from '@/playback/use-playback';
import { formatDuration, trackSubtitle } from '@/ui/format';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';

type IndexedTrackRowProps = {
  track: Track;
  /** 在歌单中的序号，从 1 开始 */
  position: number;
  /** 序号列宽度。同一列表内所有行必须相同才对齐，由列表用 `positionColumnWidth` 算出 */
  positionWidth: number;
  onPress: () => void;
  onMore: () => void;
  onLongPress?: () => void;
};

/** 设计稿给两位数序号的宽度 */
const BASE_POSITION_WIDTH = 22;
/** 13 号字等宽数字的宽度，略留余量 */
const DIGIT_WIDTH = 8;

/**
 * 序号列宽度按列表总行数的位数计算（fix-android-acceptance-ui-issues/design.md 决策 4）：
 * 「最多有几位」只有列表知道；两位数及以内保持设计稿宽度，每多一位加一个数字宽。
 */
export function positionColumnWidth(count: number): number {
  return BASE_POSITION_WIDTH + Math.max(0, String(count).length - 2) * DIGIT_WIDTH;
}

/**
 * 歌单详情里的曲目行：序号列 + 曲目信息 + 时长。
 *
 * 与曲库列表的 TrackRow 是两种行——那里靠封面辨认曲目，这里靠序号表达歌单内的
 * 顺序，正在播放的一首把序号换成波形图标。设计稿把它们画成了两个不同的样式。
 */
export function IndexedTrackRow({
  track,
  position,
  positionWidth,
  onPress,
  onMore,
  onLongPress,
}: IndexedTrackRowProps) {
  const active = useIsCurrentTrack(track.id);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 11,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: active ? Colors.accentSoft : 'transparent',
      }}
    >
      <View style={{ width: positionWidth, alignItems: 'center' }}>
        {active ? (
          <AudioLines size={17} color={Colors.accent} />
        ) : (
          <AppText
            size={13}
            color={Colors.textMuted}
            numberOfLines={1}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {position}
          </AppText>
        )}
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <AppText
          size={14}
          weight="medium"
          color={active ? Colors.accent : Colors.text}
          numberOfLines={1}
        >
          {track.title}
        </AppText>
        <AppText size={12} color={Colors.textMuted} numberOfLines={1}>
          {trackSubtitle(track)}
        </AppText>
      </View>

      {track.durationMs ? (
        <AppText size={12} color={Colors.textMuted}>
          {formatDuration(track.durationMs)}
        </AppText>
      ) : null}

      {/* 单曲下载入口。本地文件曲目不渲染，纯本地曲库的歌单看不出任何变化。 */}
      <DownloadButton track={track} />

      <Pressable onPress={onMore} hitSlop={10}>
        <EllipsisVertical size={16} color={Colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}
