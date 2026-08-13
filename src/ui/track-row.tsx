// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { EllipsisVertical, TriangleAlert } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { DownloadButton } from '@/cache/ui/download-button';
import type { Track } from '@/domain/model/track';
import { Artwork } from '@/ui/artwork';
import { trackSubtitle } from '@/ui/format';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';

/** 设计稿 Component / Track Row：封面 50，行与行之间由列表的 gap 15 分隔。 */
export const TRACK_ROW_GAP = 15;

type TrackRowProps = {
  track: Track;
  active?: boolean;
  onPress: () => void;
  /** 行尾的「更多」。播放队列改用 trailing 放移除按钮，因此这里是可选的。 */
  onMore?: () => void;
  /** 歌单详情页用它接入长按拖动排序；其余场景不传。 */
  onLongPress?: () => void;
  /** 覆盖行尾控件。给了它就不再渲染「更多」。 */
  trailing?: ReactNode;
};

export function TrackRow({
  track,
  active = false,
  onPress,
  onMore,
  onLongPress,
  trailing,
}: TrackRowProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}
    >
      <Artwork uri={track.artworkUri} width={50} height={50} radius={12} />
      <View style={{ flex: 1, gap: 4 }}>
        <AppText
          size={14}
          weight="medium"
          color={active ? Colors.accent : Colors.text}
          numberOfLines={1}
        >
          {track.title}
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {track.unavailable ? <TriangleAlert size={12} color={Colors.textMuted} /> : null}
          <AppText size={12} color={Colors.textMuted} numberOfLines={1} style={{ flex: 1 }}>
            {trackSubtitle(track, true)}
          </AppText>
        </View>
      </View>
      {/*
        行尾默认是「下载 + 更多」。下载入口必须落在曲目行上——插件搜索的结果加入曲库后，
        用户下一眼看到的就是这样一行，让他为了下载先去开播放页是没道理的。
        本地文件曲目的按钮整个不渲染，纯本地曲库看不出任何变化。

        传了 trailing 的场景（播放队列的移除、缓存管理的体积与删除）不叠加下载按钮：
        那两处的行尾已经有各自的动作，而缓存管理页列的本来就全是已下载的曲目。
      */}
      {trailing ?? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <DownloadButton track={track} />
          {onMore ? (
            <Pressable onPress={onMore} hitSlop={10}>
              <EllipsisVertical size={18} color={Colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}
