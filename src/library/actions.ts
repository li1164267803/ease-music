// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { deleteDownload } from '@/cache/queue';
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
 * 这里额外处理数据库管不到的文件，判断标准只有一条：**这个文件是谁的**。
 *
 * - **用户设备上的原始文件一律不动**（music-library spec 的硬性要求）：Android 侧
 *   指向的就是用户的原文件，远程与插件曲目的资源在来源那一侧，都不属于应用。
 * - **应用自己为这首曲目产生的派生文件一并清掉**：iOS 导入时复制进沙箱的那份副本、
 *   离线缓存下载的音频、提取出来落盘的封面。它们不是用户的资产，曲目记录消失后
 *   再无从界面触达，留着只会占存储且无法被清理。
 *
 * 缓存必须在删除曲目行**之前**清：`track_cache` 的外键是 ON DELETE CASCADE，
 * 曲目一删记录就没了，那时再想找缓存文件的路径已经无从查起。
 */
export async function removeTrackFromLibrary(trackId: string): Promise<void> {
  const track = await getTrack(trackId);
  if (!track) return;

  await deleteDownload(trackId);
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
