// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import type { Track } from '@/domain/model/track';
import {
  addTracksToPlaylist,
  listPlaylistIdsOfTrack,
  removeTrackFromPlaylist,
} from '@/domain/repository/playlist-repository';
import { deletePlayRecord } from '@/history/repository';
import { notifyHistoryChanged } from '@/history/store';
import { removeTrackFromLibrary } from '@/library/actions';
import { notifyLibraryChanged, useLibraryQuery, usePlaylists } from '@/library/store';
import { appendToQueue } from '@/playback/player';
import { Sheet, SheetAction } from '@/ui/sheet';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';

type TrackActionsSheetProps = {
  track: Track | null;
  /** 在歌单详情页打开时传入，用于提供「从本歌单移除」 */
  playlistId?: string;
  /** 从「最近播放」区块打开时置为 true，用于提供「从最近播放移除」 */
  inHistory?: boolean;
  onClose: () => void;
};

export function TrackActionsSheet({
  track,
  playlistId,
  inHistory = false,
  onClose,
}: TrackActionsSheetProps) {
  const [mode, setMode] = useState<'actions' | 'playlists'>('actions');

  const close = () => {
    setMode('actions');
    onClose();
  };

  // 弹层始终挂载，靠 visible 控制显隐——曲目变为 null 时若直接卸载，
  // Modal 的关闭动画会被打断，看起来像是闪退。
  if (!track) {
    return (
      <Sheet visible={false} title="" onClose={close}>
        {null}
      </Sheet>
    );
  }

  return (
    <Sheet visible title={track.title} onClose={close}>
      {mode === 'playlists' ? (
        <PlaylistPicker track={track} onDone={close} />
      ) : (
        <>
          <SheetAction
            label="加入播放队列"
            onPress={() => {
              void appendToQueue([track]);
              close();
            }}
          />
          <SheetAction label="加入歌单…" onPress={() => setMode('playlists')} />
          {playlistId ? (
            <SheetAction
              label="从本歌单移除"
              hint="曲目仍保留在曲库与其他歌单中"
              onPress={() => {
                void removeTrackFromPlaylist(playlistId, track.id).then(notifyLibraryChanged);
                close();
              }}
            />
          ) : null}
          {inHistory ? (
            <SheetAction
              label="从最近播放移除"
              hint="只删这一条播放记录，曲目仍在曲库中"
              onPress={() => {
                void deletePlayRecord(track.id).then(notifyHistoryChanged);
                close();
              }}
            />
          ) : null}
          {/*
            与上一项只隔一行，差别必须由副文案说清：这一项把曲目从**曲库**拿掉，
            那一项只删一条记录。两者都不删设备上的文件。
          */}
          <SheetAction
            label="从曲库移除"
            hint="不会删除设备上的原始文件"
            danger
            onPress={() => {
              void removeTrackFromLibrary(track.id).then(notifyLibraryChanged);
              close();
            }}
          />
        </>
      )}
    </Sheet>
  );
}

function PlaylistPicker({ track, onDone }: { track: Track; onDone: () => void }) {
  const playlists = usePlaylists();
  const belongsTo = useLibraryQuery(() => listPlaylistIdsOfTrack(track.id), [track.id]);
  const owned = new Set(belongsTo ?? []);

  if (playlists.length === 0) {
    return (
      <AppText size={12} color={Colors.textMuted}>
        还没有歌单。先在「歌单」里新建一个。
      </AppText>
    );
  }

  return (
    <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
      {playlists.map((playlist) => {
        const inPlaylist = owned.has(playlist.id);
        return (
          <Pressable
            key={playlist.id}
            onPress={() => {
              // 已在歌单中时不重复加入——仓储层的 INSERT OR IGNORE 已保证这一点，
              // 这里只是让界面不给出会产生重复条目的错觉。
              if (!inPlaylist) {
                void addTracksToPlaylist(playlist.id, [track.id]).then(notifyLibraryChanged);
              }
              onDone();
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 13,
              paddingHorizontal: 14,
              borderRadius: 14,
              backgroundColor: Colors.surface2,
            }}
          >
            <View style={{ gap: 3 }}>
              <AppText size={14} weight="medium">
                {playlist.name}
              </AppText>
              <AppText size={11} color={Colors.textMuted}>
                {playlist.trackCount} 首
              </AppText>
            </View>
            {inPlaylist ? <Check size={18} color={Colors.accent} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
