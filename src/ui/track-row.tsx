// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { EllipsisVertical, TriangleAlert } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import type { Track } from '@/domain/model/track';
import { Artwork } from '@/ui/artwork';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';

/** 设计稿 Component / Track Row 的行高：封面 50 + 上下留白。 */
export const TRACK_ROW_HEIGHT = 66;

type TrackRowProps = {
  track: Track;
  active?: boolean;
  onPress: () => void;
  onMore: () => void;
  /** 歌单详情页用它接入长按拖动排序；其余场景不传。 */
  onLongPress?: () => void;
};

export function TrackRow({ track, active = false, onPress, onMore, onLongPress }: TrackRowProps) {
  const titleColor = active ? Colors.accent : Colors.text;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        height: TRACK_ROW_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: active ? Colors.accentSoft : 'transparent',
      }}
    >
      <Artwork uri={track.artworkUri} size={50} radius={12} />
      <View style={{ flex: 1, gap: 4 }}>
        <AppText size={14} weight="medium" color={titleColor} numberOfLines={1}>
          {track.title}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {track.unavailable ? <TriangleAlert size={12} color={Colors.textMuted} /> : null}
          <AppText size={12} color={Colors.textMuted} numberOfLines={1}>
            {subtitle(track)}
          </AppText>
        </View>
      </View>
      <Pressable onPress={onMore} hitSlop={10}>
        <EllipsisVertical size={18} color={Colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

function subtitle(track: Track): string {
  // 曲目失效时把原因摆在艺人的位置上——media-source spec 要求用户能看出发生了什么，
  // 而不是发现一首歌莫名其妙点不响。
  if (track.unavailable) return '文件已失效，无法播放';

  const artist = track.artist ?? '未知艺术家';
  return track.durationMs ? `${artist} · ${formatDuration(track.durationMs)}` : artist;
}

export function formatDuration(ms: number): string {
  const total = Math.max(Math.round(ms / 1000), 0);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
