// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/domain/db';
import type { NewTrack, SourceId, Track, TrackSortKey } from '@/domain/model/track';

/** 导出给需要 join `tracks` 的其他仓储（如离线缓存），避免各处重复一份行映射。 */
export type TrackRow = {
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

const COLUMNS = `id, source_id, source_key, source_ref, title, artist, album,
                 duration_ms, track_number, artwork_uri, added_at, unavailable`;

export function toTrack(row: TrackRow): Track {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceKey: row.source_key,
    // source_ref 由本模块写入，理论上必为合法 JSON；真出现损坏时降级为空对象，
    // 由来源层报 invalid-source-ref，而不是让整个曲库列表因一行坏数据崩掉。
    sourceRef: parseSourceRef(row.source_ref),
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

function parseSourceRef(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const SORT_CLAUSES: Record<TrackSortKey, string> = {
  // NOCASE 让中英文混排的曲库按标题排序时不因大小写割裂
  title: 'title COLLATE NOCASE ASC',
  artist: 'artist COLLATE NOCASE ASC, title COLLATE NOCASE ASC',
  addedAt: 'added_at DESC',
};

export type ListTracksOptions = {
  sortBy?: TrackSortKey;
  /** 关键词同时匹配标题、艺术家、专辑（music-library spec 的检索要求） */
  keyword?: string;
};

export async function listTracks({ sortBy = 'addedAt', keyword }: ListTracksOptions = {}): Promise<
  Track[]
> {
  const db = await getDatabase();
  const order = SORT_CLAUSES[sortBy];
  const term = keyword?.trim();

  if (!term) {
    const rows = await db.getAllAsync<TrackRow>(`SELECT ${COLUMNS} FROM tracks ORDER BY ${order}`);
    return rows.map(toTrack);
  }

  // LIKE 的通配符需要转义，否则用户输入的 % 或 _ 会被当成通配符
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  const rows = await db.getAllAsync<TrackRow>(
    `SELECT ${COLUMNS} FROM tracks
     WHERE title  LIKE ? ESCAPE '\\'
        OR artist LIKE ? ESCAPE '\\'
        OR album  LIKE ? ESCAPE '\\'
     ORDER BY ${order}`,
    [pattern, pattern, pattern],
  );
  return rows.map(toTrack);
}

export async function getTrack(id: string): Promise<Track | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TrackRow>(`SELECT ${COLUMNS} FROM tracks WHERE id = ?`, [id]);
  return row ? toTrack(row) : null;
}

export async function findBySourceKey(
  sourceId: SourceId,
  sourceKey: string,
): Promise<Track | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<TrackRow>(
    `SELECT ${COLUMNS} FROM tracks WHERE source_id = ? AND source_key = ?`,
    [sourceId, sourceKey],
  );
  return row ? toTrack(row) : null;
}

export type AddTrackResult = { track: Track; created: boolean };

/**
 * 批量加入曲库，一个排他事务内逐条去重插入，返回与输入等长、保持顺序的结果
 * （add-plugin-discovery-import/design.md 决策 3）。
 *
 * 去重规则不变：同一来源下已存在同一标识的曲目不新建，直接返回既有记录——
 * music-library spec 要求重复添加不产生重复记录。同一批里出现两次的曲目，第二次
 * 会查到第一次刚插入的那条，同样不重复。
 *
 * 事务不只是快（自动提交模式下几百条各落一次盘是秒级，事务内是毫秒级）：
 * 中途失败整批回滚，不会留下半个列表。
 */
export async function addTracks(inputs: NewTrack[]): Promise<AddTrackResult[]> {
  if (inputs.length === 0) return [];

  const db = await getDatabase();
  const results: AddTrackResult[] = [];
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const input of inputs) results.push(await insertUnlessExisting(txn, input));
  });
  return results;
}

/** 加入单首曲目。一查一插两条语句，不需要事务；去重与记录形态与批量完全相同。 */
export async function addTrack(input: NewTrack): Promise<AddTrackResult> {
  return insertUnlessExisting(await getDatabase(), input);
}

/** 事务内外都能用的执行器：数据库对象与事务对象都满足。 */
type Executor = Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;

async function insertUnlessExisting(executor: Executor, input: NewTrack): Promise<AddTrackResult> {
  const existing = await executor.getFirstAsync<TrackRow>(
    `SELECT ${COLUMNS} FROM tracks WHERE source_id = ? AND source_key = ?`,
    [input.sourceId, input.sourceKey],
  );
  if (existing) return { track: toTrack(existing), created: false };

  const track: Track = {
    ...input,
    id: randomUUID(),
    addedAt: Date.now(),
    unavailable: false,
  };
  await executor.runAsync(
    `INSERT INTO tracks (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      track.id,
      track.sourceId,
      track.sourceKey,
      JSON.stringify(track.sourceRef),
      track.title,
      track.artist,
      track.album,
      track.durationMs,
      track.trackNumber,
      track.artworkUri,
      track.addedAt,
      0,
    ],
  );
  return { track, created: true };
}

/**
 * 从曲库移除。歌单中的关联条目由外键的 ON DELETE CASCADE 一并清除
 * （playlist spec：不得在歌单中遗留无法播放的空条目）。
 * 设备上的源文件不受影响——music-library spec 的明确要求。
 */
export async function removeTrack(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM tracks WHERE id = ?', [id]);
}

export async function setTrackUnavailable(id: string, unavailable: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE tracks SET unavailable = ? WHERE id = ?', [unavailable ? 1 : 0, id]);
}
