// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Check, ChevronLeft, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { candidateKey, type CandidateTrack } from '@/domain/model/candidate-track';
import { addCandidateTrack } from '@/library/import';
import { notifyLibraryChanged } from '@/library/store';
import { searchablePlugins } from '@/plugins/manager';
import { searchPlugins } from '@/plugins/search';
import { Artwork } from '@/ui/artwork';
import { Screen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { AppText } from '@/ui/text';
import { Colors, IconSize, MINI_DOCK_HEIGHT } from '@/ui/theme';

/**
 * 插件搜索。
 *
 * 结果是**尚未加入曲库的候选曲目**（design.md 决策 3）：用户不选择加入，曲库、歌单与
 * 曲库检索都不会发生任何变化。加入之后它与本地文件曲目完全同权。
 */
export default function PluginSearchScreen() {
  const router = useRouter();

  const [keyword, setKeyword] = useState('');
  const [candidates, setCandidates] = useState<CandidateTrack[]>([]);
  const [continuing, setContinuing] = useState<string[]>([]);
  const [failures, setFailures] = useState<{ platform: string; reason: string }[]>([]);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());

  const hasSearchable = searchablePlugins().length > 0;

  const search = async (nextPage: number) => {
    const query = keyword.trim();
    if (!query || busy) return;

    setBusy(true);
    try {
      // 第一页查全部可搜索插件；后续页只查上一页表示「还有」的那些，
      // 避免向已经到底的插件反复要下一页。
      const outcome = await searchPlugins(query, nextPage, nextPage === 1 ? undefined : continuing);
      setCandidates((previous) =>
        nextPage === 1 ? outcome.candidates : [...previous, ...outcome.candidates],
      );
      setContinuing(outcome.continuing);
      setFailures(outcome.failures);
      setPage(nextPage);
    } finally {
      setBusy(false);
    }
  };

  const add = async (candidate: CandidateTrack) => {
    await addCandidateTrack(candidate);
    notifyLibraryChanged();
    setAdded((previous) => new Set(previous).add(candidateKey(candidate)));
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

      {hasSearchable ? (
        <SearchField
          value={keyword}
          onChangeText={setKeyword}
          placeholder="输入歌曲名或艺人"
          onSubmitEditing={() => void search(1)}
        />
      ) : null}

      {!hasSearchable ? (
        <AppText size={12} color={Colors.textMuted} lineHeight={19}>
          当前没有可用于搜索的插件。已安装的插件中没有提供搜索能力的，或者你还没有安装任何插件。
        </AppText>
      ) : (
        <FlashList
          data={candidates}
          keyExtractor={candidateKey}
          contentContainerStyle={{ paddingBottom: MINI_DOCK_HEIGHT }}
          ItemSeparatorComponent={() => <View style={{ height: 15 }} />}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (continuing.length > 0) void search(page + 1);
          }}
          ListEmptyComponent={
            busy ? null : (
              <AppText size={12} color={Colors.textMuted}>
                {page === 0 ? '输入关键词后回车开始搜索。' : '没有找到匹配的曲目。'}
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
          renderItem={({ item }) => (
            <CandidateRow
              candidate={item}
              added={added.has(candidateKey(item))}
              onAdd={() => void add(item)}
            />
          )}
        />
      )}
    </Screen>
  );
}

function CandidateRow({
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
