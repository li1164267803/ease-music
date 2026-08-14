// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useRouter } from 'expo-router';
import { ArrowUpDown, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { listDownloadedTracks } from '@/cache/repository';
import { createPlaylist } from '@/domain/repository/playlist-repository';
import {
  notifyLibraryChanged,
  useCollections,
  useLibraryQuery,
  usePlaylists,
} from '@/library/store';
import { playQueue } from '@/playback/player';
import { Chip } from '@/ui/chip';
import { formatBytes, formatRelativeDay } from '@/ui/format';
import { ImportSheet } from '@/ui/import-sheet';
import { MediaCard } from '@/ui/media-card';
import { NameSheet } from '@/ui/name-sheet';
import { Screen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { SectionHead } from '@/ui/section-head';
import { Sheet, SheetAction } from '@/ui/sheet';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';
import { useDockInset } from '@/ui/bottom-dock';

/** 设计稿 Grid：两列，列间距 16、行间距 18，卡片封面高 152。 */
const COLUMN_GAP = 16;
const ROW_GAP = 18;
const COVER_HEIGHT = 152;

type Category = 'playlist' | 'album' | 'artist' | 'downloaded';

const CATEGORIES: { key: Category; label: string; title: string; unit: string }[] = [
  { key: 'playlist', label: '歌单', title: '我的歌单', unit: '个' },
  { key: 'album', label: '专辑', title: '专辑', unit: '张' },
  { key: 'artist', label: '艺人', title: '艺人', unit: '位' },
  { key: 'downloaded', label: '已下载', title: '已下载', unit: '首' },
];

/** 网格里一张卡片所需的全部信息，四个分类各自组装成它。 */
type Entry = {
  key: string;
  coverUri: string | null;
  title: string;
  meta: string;
  onPress: () => void;
};

export default function LibraryScreen() {
  const dockInset = useDockInset();
  const router = useRouter();

  const [category, setCategory] = useState<Category>('playlist');
  const [keyword, setKeyword] = useState('');
  const [byName, setByName] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const playlists = usePlaylists();
  // 只按当前分类取一次聚合：歌单与「已下载」分类下这份结果用不上，但多查一次
  // 专辑还是艺人的代价，远小于为每个分类各挂一个 hook。
  const collections = useCollections(category === 'artist' ? 'artist' : 'album');
  // 下载完成与删除缓存都会发一次曲库变更广播，因此这份查询跟着一起重跑。
  const downloaded = useLibraryQuery(() => listDownloadedTracks(), []) ?? [];

  const entries = (
    category === 'playlist'
      ? playlists.map<Entry>((playlist) => ({
          key: playlist.id,
          coverUri: playlist.coverUri,
          title: playlist.name,
          meta: `${playlist.trackCount} 首 · ${formatRelativeDay(playlist.createdAt)}`,
          onPress: () => router.push(`/playlist/${playlist.id}`),
        }))
      : category === 'downloaded'
        ? downloaded.map<Entry>((item, index) => ({
            key: item.track.id,
            coverUri: item.track.artworkUri,
            title: item.track.title,
            meta: `${item.track.artist ?? '未知艺术家'} · ${formatBytes(item.bytes)}`,
            // 点一首就把整份已下载内容作为队列播起来——离线场景下这一串正好是
            // 此刻唯一确定能连着播完的曲目。
            onPress: () =>
              void playQueue(
                downloaded.map((entry) => entry.track),
                index,
              ),
          }))
        : collections.map<Entry>((collection) => ({
            key: collection.name,
            coverUri: collection.coverUri,
            title: collection.name,
            meta: collection.meta,
            onPress: () => void playQueue(collection.tracks),
          }))
  ).filter((entry) => entry.title.toLowerCase().includes(keyword.trim().toLowerCase()));

  const sorted = byName
    ? [...entries].sort((a, b) => a.title.localeCompare(b.title, 'zh'))
    : entries;

  const rows: Entry[][] = [];
  for (let index = 0; index < sorted.length; index += 2) {
    rows.push(sorted.slice(index, index + 2));
  }

  const active = CATEGORIES.find((item) => item.key === category);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText size={24} weight="bold" letterSpacing={-0.5}>
          音乐库
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <Pressable onPress={() => setSorting(true)} hitSlop={10}>
            <ArrowUpDown size={21} color={Colors.text} />
          </Pressable>
          <Pressable onPress={() => setAdding(true)} hitSlop={10}>
            <Plus size={21} color={Colors.text} />
          </Pressable>
        </View>
      </View>

      <SearchField value={keyword} onChangeText={setKeyword} placeholder="搜索歌曲、艺人或歌单" />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {CATEGORIES.map((item) => (
          <Chip
            key={item.key}
            label={item.label}
            active={item.key === category}
            onPress={() => setCategory(item.key)}
          />
        ))}
      </View>

      <SectionHead
        title={active?.title ?? ''}
        trailing={`${sorted.length} ${active?.unit ?? ''}`}
      />

      {sorted.length === 0 ? (
        <EmptyCategory category={category} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: ROW_GAP, paddingBottom: dockInset }}
          showsVerticalScrollIndicator={false}
        >
          {rows.map((row) => (
            <View key={row[0]?.key} style={{ flexDirection: 'row', gap: COLUMN_GAP }}>
              {row.map((entry) => (
                <MediaCard
                  key={entry.key}
                  coverUri={entry.coverUri}
                  title={entry.title}
                  meta={entry.meta}
                  coverHeight={COVER_HEIGHT}
                  onPress={entry.onPress}
                />
              ))}
              {/* 单数张卡片时补一个等宽占位，避免最后一张被拉伸到整行 */}
              {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </ScrollView>
      )}

      <Sheet visible={sorting} title="排序方式" onClose={() => setSorting(false)}>
        <SheetAction
          label={category === 'playlist' ? '最近创建' : '曲目最多'}
          hint={byName ? undefined : '当前'}
          onPress={() => {
            setByName(false);
            setSorting(false);
          }}
        />
        <SheetAction
          label="按名称"
          hint={byName ? '当前' : undefined}
          onPress={() => {
            setByName(true);
            setSorting(false);
          }}
        />
      </Sheet>

      <Sheet visible={adding} title="添加" onClose={() => setAdding(false)}>
        <SheetAction
          label="新建歌单"
          onPress={() => {
            setAdding(false);
            setCreating(true);
          }}
        />
        <SheetAction
          label="导入音乐"
          hint="本地音频文件或音频地址"
          onPress={() => {
            setAdding(false);
            setImporting(true);
          }}
        />
      </Sheet>

      <NameSheet
        visible={creating}
        title="新建歌单"
        confirmLabel="创建"
        onClose={() => setCreating(false)}
        onSubmit={async (name) => {
          const playlist = await createPlaylist(name);
          if (!playlist) return '歌单名称不能为空。';
          notifyLibraryChanged();
          return null;
        }}
      />

      <ImportSheet visible={importing} onClose={() => setImporting(false)} />
    </Screen>
  );
}

const EMPTY_HINTS: Record<Category, string> = {
  playlist: '还没有歌单，用右上角的 + 新建一个',
  album: '曲库里还没有带专辑信息的曲目',
  artist: '曲库里还没有带艺人信息的曲目',
  downloaded: '还没有下载任何曲目。在播放页或歌单里点下载图标，即可离线收听',
};

function EmptyCategory({ category }: { category: Category }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <AppText size={13} color={Colors.textMuted}>
        {EMPTY_HINTS[category]}
      </AppText>
    </View>
  );
}
