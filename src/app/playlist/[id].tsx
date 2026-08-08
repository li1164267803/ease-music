// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 琥珀音乐 AmberMusic

import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Ellipsis, ListMusic, Play, Shuffle } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import ReorderableList, { reorderItems, useReorderableDrag } from 'react-native-reorderable-list';

import type { Track } from '@/domain/model/track';
import {
  deletePlaylist,
  getPlaylist,
  listPlaylistTracks,
  renamePlaylist,
  reorderPlaylist,
} from '@/domain/repository/playlist-repository';
import { playPlaylist } from '@/library/actions';
import { notifyLibraryChanged, useLibraryQuery } from '@/library/store';
import { setPlayMode } from '@/playback/player';
import { usePlayback } from '@/playback/use-playback';
import { NameSheet } from '@/ui/name-sheet';
import { Screen } from '@/ui/screen';
import { Sheet, SheetAction } from '@/ui/sheet';
import { AppText } from '@/ui/text';
import { Colors, DOCK_HEIGHT } from '@/ui/theme';
import { TrackActionsSheet } from '@/ui/track-actions-sheet';
import { TrackRow } from '@/ui/track-row';

/**
 * 长按进入拖动。`useReorderableDrag` 只能在列表项内部调用，因此单独包一层，
 * 而不是把拖动手柄的概念泄漏进通用的 TrackRow。
 */
function DraggableTrackRow(props: {
  track: Track;
  active: boolean;
  onPress: () => void;
  onMore: () => void;
}) {
  const drag = useReorderableDrag();
  return <TrackRow {...props} onLongPress={drag} />;
}

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const playback = usePlayback();

  const playlist = useLibraryQuery(() => getPlaylist(id), [id]);
  const stored = useLibraryQuery(() => listPlaylistTracks(id), [id]);

  // 拖动松手后要立刻按新顺序渲染，否则列表会弹回原位；数据库写入与重查随后跟上。
  // 只记「顺序」而不是整份曲目副本：曲目内容的真相始终在 stored 里，这里叠加的仅是
  // 一个短暂的排序意图。曲目增删导致 id 集合对不上时自动作废，不需要 effect 去清。
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);

  const tracks = useMemo(() => {
    if (!stored) return [];
    if (!pendingOrder || pendingOrder.length !== stored.length) return stored;

    const byId = new Map(stored.map((track) => [track.id, track]));
    const reordered = pendingOrder.flatMap((trackId) => {
      const track = byId.get(trackId);
      return track ? [track] : [];
    });
    return reordered.length === stored.length ? reordered : stored;
  }, [stored, pendingOrder]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [actionsFor, setActionsFor] = useState<Track | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const start = async (shuffle: boolean) => {
    if (shuffle) await setPlayMode('shuffle');
    const result = await playPlaylist(id);
    setNotice(result.ok ? null : result.reason);
  };

  return (
    <Screen gap={22}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ChevronLeft size={24} color={Colors.text} />
        </Pressable>
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={10}>
          <Ellipsis size={22} color={Colors.text} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 18 }}>
        <View
          style={{
            width: 150,
            height: 150,
            borderRadius: 20,
            backgroundColor: Colors.surface2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ListMusic size={44} color={Colors.textMuted} />
        </View>
        <View style={{ flex: 1, gap: 7, justifyContent: 'center' }}>
          <AppText size={11} weight="semibold" color={Colors.accent}>
            歌单
          </AppText>
          <AppText size={27} weight="bold" numberOfLines={2}>
            {playlist?.name ?? ''}
          </AppText>
          <AppText size={12} color={Colors.textMuted}>
            {tracks.length} 首
          </AppText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable
          onPress={() => void start(false)}
          style={{
            flex: 1,
            height: 46,
            borderRadius: 24,
            backgroundColor: Colors.accent,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Play size={17} color={Colors.bg} fill={Colors.bg} />
          <AppText size={14} weight="semibold" color={Colors.bg}>
            播放全部
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => void start(true)}
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: Colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Shuffle size={18} color={Colors.text} />
        </Pressable>
      </View>

      {notice ? (
        <AppText size={12} color={Colors.textMuted}>
          {notice}
        </AppText>
      ) : null}

      <ReorderableList
        data={tracks}
        keyExtractor={(track) => track.id}
        contentContainerStyle={{ paddingBottom: DOCK_HEIGHT }}
        showsVerticalScrollIndicator={false}
        onReorder={({ from, to }) => {
          const order = reorderItems(tracks, from, to).map((track) => track.id);
          setPendingOrder(order);
          // 顺序即刻持久化——playlist spec 要求重启后顺序保持
          void reorderPlaylist(id, order).then(notifyLibraryChanged);
        }}
        renderItem={({ item }) => (
          <DraggableTrackRow
            track={item}
            active={playback.currentTrack?.id === item.id}
            onPress={() => void playPlaylist(id, item.id)}
            onMore={() => setActionsFor(item)}
          />
        )}
        style={{ flex: 1 }}
      />

      <Sheet visible={menuOpen} title={playlist?.name ?? ''} onClose={() => setMenuOpen(false)}>
        <SheetAction
          label="重命名"
          onPress={() => {
            setMenuOpen(false);
            setRenaming(true);
          }}
        />
        <SheetAction
          label="删除歌单"
          hint="其中的曲目仍保留在曲库中"
          danger
          onPress={() => {
            void deletePlaylist(id).then(() => {
              notifyLibraryChanged();
              router.back();
            });
          }}
        />
      </Sheet>

      <NameSheet
        visible={renaming}
        title="重命名歌单"
        confirmLabel="保存"
        initialValue={playlist?.name ?? ''}
        onClose={() => setRenaming(false)}
        onSubmit={async (name) => {
          const ok = await renamePlaylist(id, name);
          if (!ok) return '歌单名称不能为空。';
          notifyLibraryChanged();
          return null;
        }}
      />

      <TrackActionsSheet track={actionsFor} playlistId={id} onClose={() => setActionsFor(null)} />
    </Screen>
  );
}
