// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { Pressable } from 'react-native';

import { Artwork } from '@/ui/artwork';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';

type MediaCardProps = {
  coverUri: string | null;
  title: string;
  meta: string;
  /** 发现页横滑卡 142，音乐库网格卡 152 */
  coverHeight: number;
  /** 横滑卡固定 150 宽；网格卡不传，由父级的 flex 分配 */
  width?: number;
  onPress: () => void;
};

/** 设计稿 Component / Album Card：封面 + 标题 + 副标题的方形卡片。 */
export function MediaCard({ coverUri, title, meta, coverHeight, width, onPress }: MediaCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={width === undefined ? { flex: 1, gap: 10 } : { width, gap: 10 }}
    >
      <Artwork uri={coverUri} width="100%" height={coverHeight} radius={16} />
      <AppText size={13} weight="semibold" lineHeight={18} numberOfLines={2}>
        {title}
      </AppText>
      <AppText size={11} color={Colors.textMuted} numberOfLines={1}>
        {meta}
      </AppText>
    </Pressable>
  );
}
