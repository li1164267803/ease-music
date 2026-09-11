// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { Check, Plus } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import type { CandidateTrack } from '@/domain/model/candidate-track';
import { Artwork } from '@/ui/artwork';
import { AppText } from '@/ui/text';
import { Colors, IconSize } from '@/ui/theme';

/**
 * 候选曲目行：插件搜索、榜单详情、歌单详情共用（add-plugin-discovery-charts/design.md 决策 3）。
 *
 * 「已加入」由列表持有而不是行内自记：FlashList 会回收复用行组件，行内的状态会随复用
 * 串到另一首曲目上；列表以曲目 key 记录才是准确的。
 */
export function CandidateRow({
  candidate,
  added,
  onAdd,
}: {
  candidate: CandidateTrack;
  added: boolean;
  onAdd: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
      <Artwork uri={candidate.artworkUri} width={50} height={50} radius={12} />
      <View style={{ flex: 1, gap: 4 }}>
        <AppText size={14} weight="medium" numberOfLines={1}>
          {candidate.title}
        </AppText>
        <AppText size={12} color={Colors.textMuted} numberOfLines={1}>
          {/* 每条结果都标明来自哪个插件——spec 的硬性要求，同名曲目也才分得清 */}
          {[candidate.artist, candidate.album].filter(Boolean).join(' · ') || '未知艺人'}
          {` · ${candidate.sourceId}`}
        </AppText>
      </View>
      <Pressable onPress={added ? undefined : onAdd} hitSlop={10} disabled={added}>
        {added ? (
          <Check size={IconSize.sm} color={Colors.accent} />
        ) : (
          <Plus size={IconSize.sm} color={Colors.textMuted} />
        )}
      </Pressable>
    </View>
  );
}
