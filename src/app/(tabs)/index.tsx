// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { FlashList } from '@shopify/flash-list';
import { Plus, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import type { Track, TrackSortKey } from '@/domain/model/track';
import { loadLibrarySort, saveLibrarySort } from '@/domain/settings';
import { useTracks } from '@/library/store';
import { playQueue } from '@/playback/player';
import { usePlayback } from '@/playback/use-playback';
import { ImportSheet } from '@/ui/import-sheet';
import { AppText } from '@/ui/text';
import { Colors, DOCK_HEIGHT, Font } from '@/ui/theme';
import { TrackActionsSheet } from '@/ui/track-actions-sheet';
import { TrackRow } from '@/ui/track-row';
import { Screen } from '@/ui/screen';

const SORTS: { key: TrackSortKey; label: string }[] = [
  { key: 'addedAt', label: '最近添加' },
  { key: 'title', label: '标题' },
  { key: 'artist', label: '艺人' },
];

export default function LibraryScreen() {
  const [sortBy, setSortBy] = useState<TrackSortKey>('addedAt');
  const [keyword, setKeyword] = useState('');
  const [importing, setImporting] = useState(false);
  const [actionsFor, setActionsFor] = useState<Track | null>(null);

  const tracks = useTracks(sortBy, keyword);
  const playback = usePlayback();

  useEffect(() => {
    void loadLibrarySort().then(setSortBy);
  }, []);

  const changeSort = (key: TrackSortKey) => {
    setSortBy(key);
    void saveLibrarySort(key);
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText size={24} weight="bold">
          曲库
        </AppText>
        <Pressable onPress={() => setImporting(true)} hitSlop={10}>
          <Plus size={21} color={Colors.text} />
        </Pressable>
      </View>

      <View
        style={{
          height: 47,
          borderRadius: 15,
          backgroundColor: Colors.surface,
          paddingHorizontal: 15,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Search size={17} color={Colors.textMuted} />
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          placeholder="搜索标题、艺人或专辑"
          placeholderTextColor={Colors.textMuted}
          style={{ flex: 1, color: Colors.text, fontFamily: Font.regular, fontSize: 13 }}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {SORTS.map((sort) => {
          const active = sort.key === sortBy;
          return (
            <Pressable
              key={sort.key}
              onPress={() => changeSort(sort.key)}
              style={{
                borderRadius: 15,
                paddingVertical: 8,
                paddingHorizontal: 14,
                backgroundColor: active ? Colors.accent : Colors.surface,
              }}
            >
              <AppText
                size={12}
                weight={active ? 'semibold' : 'medium'}
                color={active ? Colors.bg : Colors.textMuted}
              >
                {sort.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText size={17} weight="bold">
          全部曲目
        </AppText>
        <AppText size={12} color={Colors.textMuted}>
          {tracks.length} 首
        </AppText>
      </View>

      {tracks.length === 0 ? (
        <EmptyLibrary searching={keyword.trim().length > 0} onImport={() => setImporting(true)} />
      ) : (
        <FlashList
          data={tracks}
          keyExtractor={(track) => track.id}
          contentContainerStyle={{ paddingBottom: DOCK_HEIGHT }}
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
