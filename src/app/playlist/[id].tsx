// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowDownToLine,
  ChevronLeft,
  Ellipsis,
  Heart,
  Play,
  Search,
  Shuffle,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import ReorderableList, { reorderItems, useReorderableDrag } from 'react-native-reorderable-list';

import { enqueueDownloads, useDownloadQueue, type DownloadQueueSnapshot } from '@/cache/queue';
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
import { Artwork } from '@/ui/artwork';
import { CircleButton } from '@/ui/circle-button';
import { formatRelativeDay, formatTotalDuration } from '@/ui/format';
import { IndexedTrackRow } from '@/ui/indexed-track-row';
import { FloatingMiniPlayer, useMiniDockInset } from '@/ui/mini-player';
import { NameSheet } from '@/ui/name-sheet';
import { Screen } from '@/ui/screen';
import { Sheet, SheetAction } from '@/ui/sheet';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';
import { TrackActionsSheet } from '@/ui/track-actions-sheet';

/**
 * 长按进入拖动。`useReorderableDrag` 只能在列表项内部调用，因此单独包一层，
 * 而不是把拖动手柄的概念泄漏进通用的行组件。
 */
function DraggableTrackRow(props: {
  track: Track;
  position: number;
  active: boolean;
  onPress: () => void;
  onMore: () => void;
}) {
  const drag = useReorderableDrag();
  return <IndexedTrackRow {...props} onLongPress={drag} />;
}

/**
 * 批量下载的整体进度与结果。
 *
 * 队列排空后仍然报一次结果——offline-cache spec 要求「最终告知用户哪些曲目未成功」，
 * 而失败的那几首在列表里只是各自显示一个警告图标，用户不会挨行去找。
 */
function describeQueue({ pending, completed, failed }: DownloadQueueSnapshot): string | null {
  if (pending > 0) return `正在下载，还剩 ${pending} 首`;
  if (completed === 0 && failed.length === 0) return null;

  const done = completed > 0 ? `已下载 ${completed} 首` : '没有曲目下载成功';
  if (failed.length === 0) return done;

  // 只失败一首时把原因说全；失败多首时逐条列出来会挤满屏幕，改为列标题，
  // 各自的具体原因在曲目行的失败图标上（长按可读无障碍标签）与重试后再次呈现。
  const first = failed[0];
  const detail =
    failed.length === 1 && first
      ? `「${first.title}」失败：${first.reason}`
      : `${failed.length} 首失败：${failed.map((item) => item.title).join('、')}`;
  return `${done}，${detail}`;
}

export default function PlaylistDetailScreen() {
  const dockInset = useMiniDockInset();
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

  const total = formatTotalDuration(playlist?.durationMs ?? null);
  const downloadNotice = describeQueue(useDownloadQueue());

  return (
    <Screen gap={22}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ChevronLeft size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          {/* 歌单内搜索尚未实现，先渲染出设计稿的位置 */}
          <Search size={22} color={Colors.text} />
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={10}>
            <Ellipsis size={22} color={Colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 18 }}>
        <View
          style={{
            borderRadius: 20,
            shadowColor: '#000000',
            shadowOpacity: 0.4,
            shadowRadius: 17,
            shadowOffset: { width: 0, height: 14 },
            elevation: 12,
          }}
        >
          <Artwork uri={playlist?.coverUri ?? null} width={150} height={150} radius={20} />
        </View>
        <View style={{ flex: 1, gap: 7 }}>
          <AppText size={11} weight="semibold" color={Colors.accent} letterSpacing={1}>
            歌单
          </AppText>
          <AppText size={27} weight="bold" letterSpacing={-0.5} lineHeight={31} numberOfLines={2}>
            {playlist?.name ?? ''}
          </AppText>
          <AppText size={12} color={Colors.textMuted} lineHeight={18}>
            {total ? `${tracks.length} 首 · ${total}` : `${tracks.length} 首`}
            {'\n'}
            {playlist ? `创建于${formatRelativeDay(playlist.createdAt)}` : ''}
          </AppText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          onPress={() => void start(false)}
          style={{
            flex: 1,
            borderRadius: 24,
            backgroundColor: Colors.accent,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 13,
            paddingHorizontal: 22,
          }}
        >
          <Play size={17} color={Colors.bg} fill={Colors.bg} />
          <AppText size={14} weight="semibold" color={Colors.bg}>
            播放全部
          </AppText>
        </Pressable>
        <CircleButton Icon={Shuffle} size={46} iconSize={18} onPress={() => void start(true)} />
        {/* 收藏依赖后续的曲库字段，先只呈现设计稿的位置 */}
        <CircleButton Icon={Heart} size={46} iconSize={18} />
        <CircleButton
          Icon={ArrowDownToLine}
          size={46}
          iconSize={18}
          onPress={() => {
            const added = enqueueDownloads(tracks);
            // 一首都没入队时必须说清楚，否则点了没反应像是坏了。
            if (added === 0) {
              setNotice('没有需要下载的曲目——它们要么已下载，要么音频本就在设备上。');
            }
          }}
        />
      </View>

      {(downloadNotice ?? notice) ? (
        <AppText size={12} color={Colors.textMuted}>
          {downloadNotice ?? notice}
        </AppText>
      ) : null}

      <ReorderableList
        data={tracks}
        keyExtractor={(track) => track.id}
        contentContainerStyle={{ paddingBottom: dockInset, gap: 2 }}
        showsVerticalScrollIndicator={false}
        onReorder={({ from, to }) => {
          const order = reorderItems(tracks, from, to).map((track) => track.id);
          setPendingOrder(order);
          // 顺序即刻持久化——playlist spec 要求重启后顺序保持
          void reorderPlaylist(id, order).then(notifyLibraryChanged);
        }}
        renderItem={({ item, index }) => (
          <DraggableTrackRow
            track={item}
            position={index + 1}
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

      <FloatingMiniPlayer />
    </Screen>
  );
}
