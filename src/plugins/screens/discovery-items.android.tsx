// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';

import {
  discoveryKey,
  fetchItemPage,
  type DiscoveryArtist,
  type DiscoveryTag,
  type ItemListKind,
} from '@/plugins/discovery';
import type { LoadedPlugin } from '@/plugins/host/loader';
import { getLoadedPlugin } from '@/plugins/manager';
import { DiscoveryItemRow } from '@/plugins/ui/discovery-item-row';
import { ScreenHeader } from '@/plugins/ui/screen-header';
import { usePagedList } from '@/plugins/ui/use-paged-list';
import { Screen } from '@/ui/screen';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';
import { useMiniDockInset } from '@/ui/mini-player';

/** 列表的来源与它的展示信息，按 `kind` 对应。 */
type Source =
  | { kind: 'sheet-tag'; credential: DiscoveryTag }
  | { kind: 'artist-album'; credential: DiscoveryArtist };

/**
 * 条目分页列表：标签下的歌单，或艺人的专辑（add-plugin-discovery-albums-artists/design.md
 * 决策 4）。参数：`platform`、`kind`、JSON 序列化的标签或艺人项。
 */
export default function PluginDiscoveryItemsScreen() {
  const {
    platform,
    kind,
    source: sourceParam,
  } = useLocalSearchParams<{ platform: string; kind: ItemListKind; source: string }>();

  const plugin = getLoadedPlugin(platform);
  const source = useMemo<Source>(
    () =>
      kind === 'sheet-tag'
        ? { kind, credential: JSON.parse(sourceParam) as DiscoveryTag }
        : { kind, credential: JSON.parse(sourceParam) as DiscoveryArtist },
    [kind, sourceParam],
  );
  const title = source.kind === 'sheet-tag' ? source.credential.title : source.credential.name;

  return (
    <Screen>
      <ScreenHeader title={title} subtitle={platform} />
      {plugin ? (
        <ItemList plugin={plugin} source={source} />
      ) : (
        <AppText size={12} color={Colors.textMuted} lineHeight={19}>
          插件「{platform}」当前不可用。
        </AppText>
      )}
    </Screen>
  );
}

function ItemList({ plugin, source }: { plugin: LoadedPlugin; source: Source }) {
  const dockInset = useMiniDockInset();
  const load = useCallback(
    (page: number) => fetchItemPage(plugin, source.kind, source.credential, page),
    [plugin, source],
  );
  const { items, busy, failure, loadMore } = usePagedList(load);

  return (
    <FlashList
      data={items}
      keyExtractor={discoveryKey}
      contentContainerStyle={{ paddingBottom: dockInset }}
      ItemSeparatorComponent={() => <View style={{ height: 15 }} />}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.5}
      onEndReached={loadMore}
      ListEmptyComponent={
        busy || failure ? null : (
          <AppText size={12} color={Colors.textMuted}>
            {source.kind === 'sheet-tag' ? '该标签下没有歌单。' : '该艺人没有专辑。'}
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
        <DiscoveryItemRow item={item} kind={source.kind === 'sheet-tag' ? 'sheet' : 'album'} />
      )}
    />
  );
}
