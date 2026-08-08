// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { randomUUID } from 'expo-crypto';

import { getDatabase } from '@/domain/db';
import { normalizePlaylistName, type Playlist } from '@/domain/model/playlist';
import type { Track } from '@/domain/model/track';

type PlaylistRow = {
  id: string;
  name: string;
  created_at: number;
  track_count: number;
};

type PlaylistTrackRow = {
  id: string;
  source_id: string;
  source_key: string;
  source_ref: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration_ms: number | null;
  track_number: number | null;
  artwork_uri: string | null;
  added_at: number;
  unavailable: number;
};

const LIST_QUERY = `
  SELECT p.id, p.name, p.created_at,
         (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count
  FROM playlists p
`;

function toPlaylist(row: PlaylistRow): Playlist {
  return { id: row.id, name: row.name, createdAt: row.created_at, trackCount: row.track_count };
}

function toTrack(row: PlaylistTrackRow): Track {
  let sourceRef: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(row.source_ref);
    if (typeof parsed === 'object' && parsed !== null)
      sourceRef = parsed as Record<string, unknown>;
  } catch {
    // 保持空对象，交由来源层报 invalid-source-ref
  }
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceKey: row.source_key,
    sourceRef,
    title: row.title,
    artist: row.artist,
    album: row.album,
    durationMs: row.duration_ms,
    trackNumber: row.track_number,
    artworkUri: row.artwork_uri,
    addedAt: row.added_at,
    unavailable: row.unavailable !== 0,
  };
}

export async function listPlaylists(): Promise<Playlist[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PlaylistRow>(`${LIST_QUERY} ORDER BY p.created_at DESC`);
  return rows.map(toPlaylist);
}

export async function getPlaylist(id: string): Promise<Playlist | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<PlaylistRow>(`${LIST_QUERY} WHERE p.id = ?`, [id]);
  return row ? toPlaylist(row) : null;
}

/** 名称为空白时返回 null，由调用方提示——playlist spec 要求拒绝空名称。 */
export async function createPlaylist(rawName: string): Promise<Playlist | null> {
  const name = normalizePlaylistName(rawName);
  if (!name) return null;

  const playlist: Playlist = { id: randomUUID(), name, createdAt: Date.now(), trackCount: 0 };
  const db = await getDatabase();
  await db.runAsync('INSERT INTO playlists (id, name, created_at) VALUES (?, ?, ?)', [
    playlist.id,
    playlist.name,
    playlist.createdAt,
  ]);
  return playlist;
}

export async function renamePlaylist(id: string, rawName: string): Promise<boolean> {
  const name = normalizePlaylistName(rawName);
  if (!name) return false;

  const db = await getDatabase();
  await db.runAsync('UPDATE playlists SET name = ? WHERE id = ?', [name, id]);
  return true;
}

/** 删除歌单。其中的曲目仍保留在曲库中——只有关联条目被级联清除。 */
export async function deletePlaylist(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM playlists WHERE id = ?', [id]);
}

export async function listPlaylistTracks(playlistId: string): Promise<Track[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PlaylistTrackRow>(
    `SELECT t.id, t.source_id, t.source_key, t.source_ref, t.title, t.artist, t.album,
            t.duration_ms, t.track_number, t.artwork_uri, t.added_at, t.unavailable
     FROM playlist_tracks pt
     JOIN tracks t ON t.id = pt.track_id
     WHERE pt.playlist_id = ?
     ORDER BY pt.position ASC`,
    [playlistId],
  );
  return rows.map(toTrack);
}

/** 一首曲目所属的全部歌单 id，用于「加入歌单」弹层里回显已归属状态。 */
export async function listPlaylistIdsOfTrack(trackId: string): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ playlist_id: string }>(
    'SELECT playlist_id FROM playlist_tracks WHERE track_id = ?',
    [trackId],
  );
  return rows.map((row) => row.playlist_id);
}

/**
 * 把曲目追加到歌单末尾。已在该歌单中的曲目不会产生重复条目，也不会被移到末尾
 * （playlist spec：重复加入不产生重复条目）。返回实际新增的数量。
 */
export async function addTracksToPlaylist(playlistId: string, trackIds: string[]): Promise<number> {
  if (trackIds.length === 0) return 0;

  const db = await getDatabase();
  let added = 0;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync<{ next: number }>(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM playlist_tracks WHERE playlist_id = ?',
      [playlistId],
    );
    let position = row?.next ?? 0;

    for (const trackId of trackIds) {
      // 主键 (playlist_id, track_id) 已表达唯一性，用 OR IGNORE 让重复加入成为无操作，
      // 比先查后插少一次往返，也不存在并发下的竞态。
      const result = await txn.runAsync(
        'INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)',
        [playlistId, trackId, position],
      );
      if (result.changes > 0) {
        position += 1;
        added += 1;
      }
    }
  });

  return added;
}

export async function removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?', [
    playlistId,
    trackId,
  ]);
}

/**
 * 按给定顺序重排歌单。传入的是重排后的完整曲目 id 序列。
 *
 * 整表重写 position 而非计算增量：歌单规模是人工维护的量级（数十到数百），
 * 一次事务内重写足够快，换来的是「界面顺序就是存储顺序」这一无歧义的保证。
 */
export async function reorderPlaylist(playlistId: string, trackIds: string[]): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const [index, trackId] of trackIds.entries()) {
      await txn.runAsync(
        'UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?',
        [index, playlistId, trackId],
      );
    }
  });
}
