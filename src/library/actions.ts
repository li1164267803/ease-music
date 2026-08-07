// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 琥珀音乐 AmberMusic

import { SOURCE_LOCAL_FILE } from '@/domain/model/track';
import { listPlaylistTracks } from '@/domain/repository/playlist-repository';
import { getTrack, listTracks, removeTrack } from '@/domain/repository/track-repository';
import { pruneArtwork } from '@/library/artwork';
import { playQueue } from '@/playback/player';
import { discardManagedFile } from '@/sources/local-file';

/**
 * 从曲库移除曲目。
 *
 * 数据库侧的级联由外键完成——曲目在所有歌单中的条目一并消失（playlist spec）。
 * 这里额外处理两件数据库管不到的事：
 *
 * 1. **设备上的原文件一律不动**（music-library spec 的硬性要求）。只有 iOS 导入时
 *    由应用自己复制进沙箱的那一份副本才删除，它本就是应用的私有产物。
 * 2. **回收无人引用的封面文件**。封面按内容寻址、被同专辑的多首曲目共享，因此不能
 *    随单首曲目删除，只能在移除后统计一遍仍在使用的封面再清理孤儿。
 */
export async function removeTrackFromLibrary(trackId: string): Promise<void> {
  const track = await getTrack(trackId);
  if (!track) return;

  await removeTrack(trackId);

  if (track.sourceId === SOURCE_LOCAL_FILE) discardManagedFile(track.sourceRef);

  if (track.artworkUri) {
    const remaining = await listTracks();
    const inUse = new Set(remaining.flatMap((item) => (item.artworkUri ? [item.artworkUri] : [])));
    pruneArtwork(inUse);
  }
}

export type PlayPlaylistResult = { ok: true } | { ok: false; reason: string };

/**
 * 播放歌单：用歌单内容按当前顺序替换播放队列，可从指定曲目开始。
 *
 * 空歌单只提示，不清空当前队列——playlist spec 的明确要求，用户正在听的东西
 * 不该因为点了一个空歌单就停掉。
 */
export async function playPlaylist(
  playlistId: string,
  startTrackId?: string,
): Promise<PlayPlaylistResult> {
  const tracks = await listPlaylistTracks(playlistId);
  if (tracks.length === 0) return { ok: false, reason: '这个歌单还没有曲目。' };

  const startIndex = startTrackId ? tracks.findIndex((track) => track.id === startTrackId) : 0;
  await playQueue(tracks, startIndex >= 0 ? startIndex : 0);
  return { ok: true };
}
