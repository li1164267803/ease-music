// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { DiscoveryItem, TrackListKind } from '@/plugins/discovery';
import { Artwork } from '@/ui/artwork';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';

/**
 * 歌单、专辑一类条目的列表行：点开进候选曲目分页页。搜索结果与条目分页列表共用。
 * 条目是插件的凭据，序列化后随路由传递（add-plugin-discovery-charts/design.md 决策 4）。
 */
export function DiscoveryItemRow({
  item,
  kind,
  showPlatform = false,
}: {
  item: DiscoveryItem;
  /** 点开后曲目页调用哪个协议方法。 */
  kind: TrackListKind;
  /** 跨插件的列表（搜索结果）要标明来源；单插件的列表页面标题已经写了。 */
  showPlatform?: boolean;
}) {
  const router = useRouter();
  const meta = [item.description, showPlatform ? item.platform : null].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/plugin-discovery/tracks',
          params: { platform: item.platform, kind, item: JSON.stringify(item) },
        })
      }
      style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}
    >
      <Artwork uri={item.artworkUri} width={50} height={50} radius={12} />
      <View style={{ flex: 1, gap: 4 }}>
        <AppText size={14} weight="medium" numberOfLines={1}>
          {item.title}
        </AppText>
        {meta ? (
          <AppText size={12} color={Colors.textMuted} numberOfLines={1}>
            {meta}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}
