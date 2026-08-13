// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { getDatabase } from '@/domain/db';
import type { Track } from '@/domain/model/track';
import { toTrack, type TrackRow } from '@/domain/repository/track-repository';

/**
 * 缓存记录的仓储。
 *
 * 表里只有**已完成**的下载（design.md 决策 7）——排队中与下载中的状态存在内存里，
 * 进程一死就该回到「未下载」，落库反而要在每次启动时把它们改回去。
 */
export type TrackCacheRecord = {
  trackId: string;
  fileUri: string;
  bytes: number;
  /**
   * 下载到的音频**实际**有多长。与 `Track.durationMs`（来源自述的时长）是两件事——
   * 两者对不上，说明拿到的不是整首（例如版权受限曲目的试听片段）。
   * 解析不出时为 null，界面只显示体积。
   */
  durationMs: number | null;
  completedAt: number;
};

type CacheRow = {
  track_id: string;
  file_uri: string;
  bytes: number;
  duration_ms: number | null;
  completed_at: number;
};

function toRecord(row: CacheRow): TrackCacheRecord {
  return {
    trackId: row.track_id,
    fileUri: row.file_uri,
    bytes: row.bytes,
    durationMs: row.duration_ms,
    completedAt: row.completed_at,
  };
}

export async function getCacheRecord(trackId: string): Promise<TrackCacheRecord | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<CacheRow>('SELECT * FROM track_cache WHERE track_id = ?', [
    trackId,
  ]);
  return row ? toRecord(row) : null;
}

export async function listCacheRecords(): Promise<TrackCacheRecord[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<CacheRow>('SELECT * FROM track_cache');
  return rows.map(toRecord);
}

/**
 * 记下一次完成的下载。
 *
 * 调用方必须在**文件已经就位之后**才调它（决策 3）：反过来会出现「记录说有、文件没有」，
 * 而那正是播放时才发现的失败。
 *
 * `INSERT OR REPLACE` 而不是先查再插——重新下载同一首时直接盖掉旧记录。
 */
export async function saveCacheRecord(record: TrackCacheRecord): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO track_cache (track_id, file_uri, bytes, duration_ms, completed_at)
     VALUES (?, ?, ?, ?, ?)`,
    [record.trackId, record.fileUri, record.bytes, record.durationMs, record.completedAt],
  );
}

export async function deleteCacheRecord(trackId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM track_cache WHERE track_id = ?', [trackId]);
}

export async function deleteAllCacheRecords(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM track_cache');
}

/** 已下载内容的整体占用，供「我的」页与缓存管理界面展示。 */
export async function getCacheUsage(): Promise<{ count: number; bytes: number }> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number; bytes: number }>(
    'SELECT COUNT(*) AS count, COALESCE(SUM(bytes), 0) AS bytes FROM track_cache',
  );
  return { count: row?.count ?? 0, bytes: row?.bytes ?? 0 };
}

export type DownloadedTrack = {
  track: Track;
  bytes: number;
  /** 缓存文件里音频的实际时长，解析不出时为 null */
  durationMs: number | null;
  completedAt: number;
};

/**
 * 已下载的曲目，最近下载的排在前面。
 *
 * 用 join 而不是「取全部曲目再在内存里筛」：已下载通常只是曲库的一小部分，
 * 让数据库只吐这一小部分出来。
 */
export async function listDownloadedTracks(): Promise<DownloadedTrack[]> {
  const db = await getDatabase();
  // `t.*` 里也有一列叫 duration_ms（来源自述的时长），会与缓存的同名列相撞，
  // 因此缓存那一列必须起别名，否则读到的是曲目的时长而不是文件的。
  const rows = await db.getAllAsync<
    TrackRow & { bytes: number; cache_duration_ms: number | null; completed_at: number }
  >(
    `SELECT t.*, c.bytes, c.duration_ms AS cache_duration_ms, c.completed_at
     FROM track_cache c JOIN tracks t ON t.id = c.track_id
     ORDER BY c.completed_at DESC`,
  );
  return rows.map((row) => ({
    track: toTrack(row),
    bytes: row.bytes,
    durationMs: row.cache_duration_ms,
    completedAt: row.completed_at,
  }));
}
