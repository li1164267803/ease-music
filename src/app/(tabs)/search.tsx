// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { FlashList } from '@shopify/flash-list';
import { ArrowUpDown } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { Track, TrackSortKey } from '@/domain/model/track';
import { loadLibrarySort, saveLibrarySort } from '@/domain/settings';
import { useTracks } from '@/library/store';
import { playQueue } from '@/playback/player';
import { usePlayback } from '@/playback/use-playback';
import { ImportSheet } from '@/ui/import-sheet';
import { Screen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { SectionHead } from '@/ui/section-head';
import { Sheet, SheetAction } from '@/ui/sheet';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';
import { TrackActionsSheet } from '@/ui/track-actions-sheet';
import { TRACK_ROW_GAP, TrackRow } from '@/ui/track-row';
import { useDockInset } from '@/ui/bottom-dock';

const SORTS: { key: TrackSortKey; label: string }[] = [
  { key: 'addedAt', label: '最近添加' },
  { key: 'title', label: '标题' },
  { key: 'artist', label: '艺人' },
];

/**
 * 搜索页。设计稿只画到「音乐库」这一层，没有单独的搜索屏——这里沿用设计稿的
 * 搜索框与区块标题，承担曲库检索与「全部曲目」浏览：关键词为空时列出整个曲库，
 * 输入后就地变成结果列表。
 */
export default function SearchScreen() {
  const dockInset = useDockInset();
  const [sortBy, setSortBy] = useState<TrackSortKey>('addedAt');
  const [keyword, setKeyword] = useState('');
  const [sorting, setSorting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [actionsFor, setActionsFor] = useState<Track | null>(null);

  const tracks = useTracks(sortBy, keyword);
  const playback = usePlayback();

  useEffect(() => {
    void loadLibrarySort().then(setSortBy);
  }, []);

  const changeSort = (key: TrackSortKey) => {
    setSortBy(key);
    setSorting(false);
    void saveLibrarySort(key);
  };

  const searching = keyword.trim().length > 0;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText size={24} weight="bold" letterSpacing={-0.5}>
          搜索
        </AppText>
        <Pressable onPress={() => setSorting(true)} hitSlop={10}>
          <ArrowUpDown size={21} color={Colors.text} />
        </Pressable>
      </View>

      <SearchField value={keyword} onChangeText={setKeyword} placeholder="搜索歌曲、艺人或专辑" />

      <SectionHead title={searching ? '搜索结果' : '全部曲目'} trailing={`${tracks.length} 首`} />

      {tracks.length === 0 ? (
        <EmptyLibrary searching={searching} onImport={() => setImporting(true)} />
      ) : (
        <FlashList
          data={tracks}
          keyExtractor={(track) => track.id}
          contentContainerStyle={{ paddingBottom: dockInset }}
          ItemSeparatorComponent={() => <View style={{ height: TRACK_ROW_GAP }} />}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              active={playback.currentTrack?.id === item.id}
              // 从曲库点播时用整个当前视图替换队列：用户看到的顺序就是接下来会播的顺序，
              // 搜索或换排序后再点，队列也随之变成那个顺序。
              onPress={() => void playQueue(tracks, index)}
              onMore={() => setActionsFor(item)}
            />
          )}
        />
      )}

      <Sheet visible={sorting} title="排序方式" onClose={() => setSorting(false)}>
        {SORTS.map((sort) => (
          <SheetAction
            key={sort.key}
            label={sort.label}
            hint={sort.key === sortBy ? '当前' : undefined}
            onPress={() => changeSort(sort.key)}
          />
        ))}
      </Sheet>

      <ImportSheet visible={importing} onClose={() => setImporting(false)} />
      <TrackActionsSheet track={actionsFor} onClose={() => setActionsFor(null)} />
    </Screen>
  );
}

function EmptyLibrary({ searching, onImport }: { searching: boolean; onImport: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <AppText size={14} color={Colors.textMuted}>
        {searching ? '没有匹配的曲目' : '曲库还是空的'}
      </AppText>
      {searching ? null : (
        <>
          <AppText size={12} color={Colors.textMuted} style={{ textAlign: 'center' }}>
            本应用不提供任何音源。{'\n'}请添加你自己的音频文件或可访问的音频地址。
          </AppText>
          <Pressable
            onPress={onImport}
            style={{
              borderRadius: 24,
              paddingVertical: 13,
              paddingHorizontal: 22,
              backgroundColor: Colors.accent,
            }}
          >
            <AppText size={14} weight="semibold" color={Colors.bg}>
              添加音乐
            </AppText>
          </Pressable>
        </>
      )}
    </View>
  );
}
