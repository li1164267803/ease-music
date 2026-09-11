// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { candidateKey, type CandidateTrack } from '@/domain/model/candidate-track';
import { addCandidateTrack } from '@/library/import';
import { notifyLibraryChanged } from '@/library/store';
import { fetchTrackPage, type DiscoveryItem, type TrackListKind } from '@/plugins/discovery';
import type { LoadedPlugin } from '@/plugins/host/loader';
import { getLoadedPlugin } from '@/plugins/manager';
import { CandidateRow } from '@/plugins/ui/candidate-row';
import { ScreenHeader } from '@/plugins/ui/screen-header';
import { usePagedList } from '@/plugins/ui/use-paged-list';
import { Screen } from '@/ui/screen';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';
import { useMiniDockInset } from '@/ui/mini-player';

/**
 * 榜单详情与歌单详情共用的候选曲目分页页（add-plugin-discovery-charts/design.md 决策 3）。
 * 参数：`platform`、`kind`（决定调用哪个协议方法）、JSON 序列化的榜单项或歌单项（决策 4）。
 *
 * 曲目是**尚未加入曲库的候选曲目**：不加入就不会碰曲库；加入后与本地文件曲目同权，
 * 逐首加入的做法与插件搜索页相同。
 */
export default function PluginDiscoveryTracksScreen() {
  const {
    platform,
    kind,
    item: itemParam,
  } = useLocalSearchParams<{ platform: string; kind: TrackListKind; item: string }>();

  const plugin = getLoadedPlugin(platform);
  const item = useMemo(() => JSON.parse(itemParam) as DiscoveryItem, [itemParam]);

  return (
    <Screen>
      <ScreenHeader title={item.title} subtitle={platform} />
      {plugin ? (
        <TrackList plugin={plugin} kind={kind} item={item} />
      ) : (
        <AppText size={12} color={Colors.textMuted} lineHeight={19}>
          插件「{platform}」当前不可用。
        </AppText>
      )}
    </Screen>
  );
}

function TrackList({
  plugin,
  kind,
  item,
}: {
  plugin: LoadedPlugin;
  kind: TrackListKind;
  item: DiscoveryItem;
}) {
  const dockInset = useMiniDockInset();
  const load = useCallback(
    (page: number) => fetchTrackPage(plugin, kind, item, page),
    [plugin, kind, item],
  );
  const { items, busy, failure, loadMore } = usePagedList(load);

  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const add = async (candidate: CandidateTrack) => {
    const { duplicate } = await addCandidateTrack(candidate);
    notifyLibraryChanged();
    setAdded((previous) => new Set(previous).add(candidateKey(candidate)));
    // 同一插件同一曲目不产生重复记录，并告知用户（plugin-discovery spec）
    setNotice(duplicate ? `「${candidate.title}」已在曲库中。` : null);
  };

  return (
    <>
      {/* 提示放在列表上方而不是尾部：长列表的尾部在屏幕之外，放那里等于没提示 */}
      {notice ? (
        <AppText size={12} color={Colors.textMuted} lineHeight={19}>
          {notice}
        </AppText>
      ) : null}
      <FlashList
        data={items}
        keyExtractor={candidateKey}
        contentContainerStyle={{ paddingBottom: dockInset }}
        ItemSeparatorComponent={() => <View style={{ height: 15 }} />}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.5}
        onEndReached={loadMore}
        ListEmptyComponent={
          busy || failure ? null : (
            <AppText size={12} color={Colors.textMuted}>
              这里没有可用的曲目。
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
        renderItem={({ item: candidate }) => (
          <CandidateRow
            candidate={candidate}
            added={added.has(candidateKey(candidate))}
            onAdd={() => void add(candidate)}
          />
        )}
      />
    </>
  );
}
