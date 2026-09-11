// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { fetchSheetsByTag, type DiscoveryTag } from '@/plugins/discovery';
import type { LoadedPlugin } from '@/plugins/host/loader';
import { getLoadedPlugin } from '@/plugins/manager';
import { ScreenHeader } from '@/plugins/ui/screen-header';
import { usePagedList } from '@/plugins/ui/use-paged-list';
import { Artwork } from '@/ui/artwork';
import { Screen } from '@/ui/screen';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';
import { useMiniDockInset } from '@/ui/mini-player';

/** 标签下的歌单分页列表。参数：`platform` 与 JSON 序列化的标签（design.md 决策 4）。 */
export default function PluginDiscoverySheetsScreen() {
  const { platform, tag: tagParam } = useLocalSearchParams<{ platform: string; tag: string }>();

  const plugin = getLoadedPlugin(platform);
  const tag = useMemo(() => JSON.parse(tagParam) as DiscoveryTag, [tagParam]);

  return (
    <Screen>
      <ScreenHeader title={tag.title} subtitle={platform} />
      {plugin ? (
        <SheetList plugin={plugin} tag={tag} />
      ) : (
        <AppText size={12} color={Colors.textMuted} lineHeight={19}>
          插件「{platform}」当前不可用。
        </AppText>
      )}
    </Screen>
  );
}

function SheetList({ plugin, tag }: { plugin: LoadedPlugin; tag: DiscoveryTag }) {
  const dockInset = useMiniDockInset();
  const router = useRouter();
  const load = useCallback((page: number) => fetchSheetsByTag(plugin, tag, page), [plugin, tag]);
  const { items, busy, failure, loadMore } = usePagedList(load);

  return (
    <FlashList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: dockInset }}
      ItemSeparatorComponent={() => <View style={{ height: 15 }} />}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.5}
      onEndReached={loadMore}
      ListEmptyComponent={
        busy || failure ? null : (
          <AppText size={12} color={Colors.textMuted}>
            该标签下没有歌单。
          </AppText>
        )
      }
      ListFooterComponent={
        <View style={{ gap: 8, paddingTop: 14 }}>
          {busy ? <ActivityIndicator color={Colors.accent} /> : null}
          {failure ? (
            <AppText size={11} color={Colors.danger} lineHeight={17}>
              {failure}
            </AppText>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/plugin-discovery/tracks',
              // 歌单项是插件的凭据，序列化后随路由传递（design.md 决策 4）
              params: { platform: plugin.meta.platform, kind: 'sheet', item: JSON.stringify(item) },
            })
          }
          style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}
        >
          <Artwork uri={item.artworkUri} width={50} height={50} radius={12} />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText size={14} weight="medium" numberOfLines={1}>
              {item.title}
            </AppText>
            {item.description ? (
              <AppText size={12} color={Colors.textMuted} numberOfLines={1}>
                {item.description}
              </AppText>
            ) : null}
          </View>
        </Pressable>
      )}
    />
  );
}
