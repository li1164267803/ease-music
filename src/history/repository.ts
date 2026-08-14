// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { getDatabase } from '@/domain/db';
import type { Track } from '@/domain/model/track';
import { toTrack, type TrackRow } from '@/domain/repository/track-repository';

/**
 * 播放历史的仓储。
 *
 * 每首曲目只有一行——产品决定是「只留最近一次 + 计次数」，不保留每次播放的流水。
 * 因此这里没有「插入一条历史」，只有「记一次播放」，它对同一首曲目是幂等的形态：
 * 第一次插入，之后每次更新时间并累加次数。
 */

/**
 * 保留上限（design.md 决策 3）。
 *
 * 以「一天听 30 首」计约覆盖一周，足够回答「最近在听什么」。不是用户可调的设置，
 * spec 也没要求可调；真有依据再改，改的就是这个常量。
 */
const HISTORY_LIMIT = 200;

export type PlayedTrack = {
  track: Track;
  lastPlayedAt: number;
  playCount: number;
};

/**
 * 记一次播放：曲目不在历史中则插入，已在则更新最后播放时间并累加次数。
 *
 * 写入后顺带把历史裁到上限（决策 3）。裁剪放在写入时而不是查询时，是因为查询时
 * `LIMIT` 只是不显示，表照样无限增长；写入频率只有「每切一首歌一次」，多一条
 * DELETE 可以忽略。
 */
export async function recordPlay(trackId: string, playedAt = Date.now()): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO playback_history (track_id, last_played_at, play_count)
     VALUES (?, ?, 1)
     ON CONFLICT (track_id) DO UPDATE SET
       last_played_at = excluded.last_played_at,
       play_count     = play_count + 1`,
    [trackId, playedAt],
  );

  // 幂等：语义是「只留最近的 N 行」，重复执行不会多删。两次快速切歌导致它多跑
  // 一次也没有影响。
  await db.runAsync(
    `DELETE FROM playback_history
     WHERE track_id NOT IN (
       SELECT track_id FROM playback_history
       ORDER BY last_played_at DESC
       LIMIT ?
     )`,
    [HISTORY_LIMIT],
  );
}

/** 最近播放的曲目，最近听的排在最前。 */
export async function listRecentlyPlayed(limit = HISTORY_LIMIT): Promise<PlayedTrack[]> {
  const db = await getDatabase();
  // `t.*` 与历史的列不重名，无需起别名（对比 track_cache 的 duration_ms 会与
  // tracks.duration_ms 相撞）。
  const rows = await db.getAllAsync<TrackRow & { last_played_at: number; play_count: number }>(
    `SELECT t.*, h.last_played_at, h.play_count
     FROM playback_history h JOIN tracks t ON t.id = h.track_id
     ORDER BY h.last_played_at DESC
     LIMIT ?`,
    [limit],
  );

  return rows.map((row) => ({
    track: toTrack(row),
    lastPlayedAt: row.last_played_at,
    playCount: row.play_count,
  }));
}

/** 历史条数，供「我的」页展示与清空入口的显隐判断。 */
export async function countPlaybackHistory(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM playback_history',
  );
  return row?.count ?? 0;
}

/**
 * 从历史中移除一首曲目。
 *
 * **只删这一条播放记录**：曲目留在曲库里、设备上的文件一律不动、已下载的音频也不动。
 * 与「从曲库移除」是两回事——后者把曲目本身拿掉，历史记录只是随外键顺带消失。
 */
export async function deletePlayRecord(trackId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM playback_history WHERE track_id = ?', [trackId]);
}

/**
 * 清空播放历史。
 *
 * 只删播放记录——曲目、元数据、封面、歌单归属、已下载的音频都不受影响
 * （offline-cache 与 music-library 两处 spec 的要求在这里没有交集，删的是第三样东西）。
 */
export async function clearPlaybackHistory(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM playback_history');
}
