// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { candidateKey } from '@/domain/model/candidate-track';
import { discoveryKey } from '@/plugins/discovery';
import { searchablePlugins } from '@/plugins/manager';
import { CONTENT_SEARCH_TYPES, type ContentSearchType } from '@/plugins/protocol';
import { searchPlugins, type SearchFailure, type SearchPage } from '@/plugins/search';
import { CandidateRow } from '@/ui/candidate-row';
import { DiscoveryArtistRow } from '@/plugins/ui/discovery-artist-row';
import { DiscoveryItemRow } from '@/plugins/ui/discovery-item-row';
import { useCandidateAdd } from '@/plugins/ui/use-candidate-add';
import { Chip } from '@/ui/chip';
import { Screen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { AppText } from '@/ui/text';
import { Colors, IconSize } from '@/ui/theme';
import { useMiniDockInset } from '@/ui/mini-player';

const TYPE_LABELS: Record<ContentSearchType, string> = {
  music: '歌曲',
  album: '专辑',
  artist: '艺人',
  sheet: '歌单',
};

/** 一页结果去掉游标与失败之后剩下的部分：界面按 `type` 决定渲染哪种行。 */
type Results = Pick<SearchPage, 'type' | 'items'>;

const EMPTY: Results = { type: 'music', items: [] };

/**
 * 插件搜索。
 *
 * 四种类型各自的结果形状不同：歌曲是**尚未加入曲库的候选曲目**（用户不选择加入，曲库、
 * 歌单与曲库检索都不会发生任何变化），专辑与歌单是点开进曲目页的条目，艺人点开进艺人页。
 */
export default function PluginSearchScreen() {
  const dockInset = useMiniDockInset();
  const router = useRouter();

  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState<ContentSearchType>('music');
  const [results, setResults] = useState<Results>(EMPTY);
  const [continuing, setContinuing] = useState<string[]>([]);
  const [failures, setFailures] = useState<SearchFailure[]>([]);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const { added, notice, add } = useCandidateAdd();

  const hasSearchable = searchablePlugins(type).length > 0;

  const search = async (nextPage: number) => {
    const query = keyword.trim();
    if (!query || busy) return;

    setBusy(true);
    // 新的一次搜索：上一次的失败不属于它，加载期间不能继续挂在列表底部
    if (nextPage === 1) setFailures([]);
    try {
      // 第一页查全部支持该类型的插件；后续页只查上一页表示「还有」的那些，
      // 避免向已经到底的插件反复要下一页。
      const outcome = await searchPlugins(
        query,
        nextPage,
        type,
        nextPage === 1 ? undefined : continuing,
      );
      setResults((previous) => appendResults(nextPage === 1 ? null : previous, outcome));
      setContinuing(outcome.continuing);
      setFailures(outcome.failures);
      setPage(nextPage);
    } finally {
      setBusy(false);
    }
  };

  /** 切换类型即另一次搜索：旧类型的结果不能留在新类型的列表里。 */
  const switchType = (next: ContentSearchType) => {
    setType(next);
    setResults(EMPTY);
    setContinuing([]);
    setFailures([]);
    setPage(0);
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ChevronLeft size={IconSize.lg} color={Colors.text} />
        </Pressable>
        <AppText size={24} weight="bold" letterSpacing={-0.5}>
          插件搜索
        </AppText>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {CONTENT_SEARCH_TYPES.map((candidate) => (
          <Chip
            key={candidate}
            label={TYPE_LABELS[candidate]}
            active={candidate === type}
            onPress={() => switchType(candidate)}
          />
        ))}
      </View>

      {hasSearchable ? (
        <SearchField
          value={keyword}
          onChangeText={setKeyword}
          placeholder={`输入${TYPE_LABELS[type]}名或关键词`}
          onSubmitEditing={() => void search(1)}
        />
      ) : null}

      {/* 提示放在列表上方而不是尾部：长列表的尾部在屏幕之外，放那里等于没提示 */}
      {notice ? (
        <AppText size={12} color={Colors.textMuted} lineHeight={19}>
          {notice}
        </AppText>
      ) : null}

      {!hasSearchable ? (
        <AppText size={12} color={Colors.textMuted} lineHeight={19}>
          {`当前没有支持搜索${TYPE_LABELS[type]}的插件。` +
            '已安装的插件中没有声明支持这一类型的，或者你还没有安装任何插件。'}
        </AppText>
      ) : (
        <FlashList
          data={results.items}
          keyExtractor={resultKey}
          contentContainerStyle={{ paddingBottom: dockInset }}
          ItemSeparatorComponent={() => <View style={{ height: 15 }} />}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (continuing.length > 0) void search(page + 1);
          }}
          ListEmptyComponent={
            busy ? null : (
              <AppText size={12} color={Colors.textMuted}>
                {page === 0 ? '输入关键词后回车开始搜索。' : `没有找到匹配的${TYPE_LABELS[type]}。`}
              </AppText>
            )
          }
          ListFooterComponent={
            <View style={{ gap: 8, paddingTop: 14 }}>
              {busy ? <ActivityIndicator color={Colors.accent} /> : null}
              {failures.map((failure) => (
                <AppText key={failure.platform} size={11} color={Colors.danger} lineHeight={17}>
                  {failure.reason}
                </AppText>
              ))}
            </View>
          }
          renderItem={({ item }) => {
            // 三种行按 item 的来路区分：候选曲目有 sourceId，艺人有 name，其余是条目。
            // 列表里所有条目都来自同一次搜索、同一种类型，这里只是让类型系统认下来。
            if ('sourceId' in item) {
              return (
                <CandidateRow
                  candidate={item}
                  added={added.has(candidateKey(item))}
                  onAdd={() => void add(item)}
                />
              );
            }
            if ('name' in item) return <DiscoveryArtistRow artist={item} />;
            return (
              <DiscoveryItemRow
                item={item}
                kind={results.type === 'album' ? 'album' : 'sheet'}
                showPlatform
              />
            );
          }}
        />
      )}
    </Screen>
  );
}

function appendResults(previous: Results | null, outcome: SearchPage): Results {
  if (!previous || previous.type !== outcome.type)
    return { type: outcome.type, items: outcome.items };
  return { type: outcome.type, items: [...previous.items, ...outcome.items] } as Results;
}

function resultKey(item: Results['items'][number]): string {
  return 'sourceId' in item ? candidateKey(item) : discoveryKey(item);
}
