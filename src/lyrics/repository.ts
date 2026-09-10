// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { getDatabase } from '@/domain/db';
import type { FoundLyrics, LyricsSource } from '@/lyrics/model';

/**
 * 歌词缓存的仓储（design.md 决策 4）。
 *
 * 每首曲目只有一行：缓存的语义是「上次为这首曲目找到的那份歌词」，不是历史。
 * 只存**找到了**的歌词——「没找到」不落库，否则用户装上歌词插件之后，之前没词的
 * 曲目永远不会再去找。
 */
type LyricsRow = {
  content: string;
  source: string;
};

const SOURCES: readonly LyricsSource[] = ['directory', 'embedded', 'source-plugin', 'lyric-plugin'];

export async function getCachedLyrics(trackId: string): Promise<FoundLyrics | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<LyricsRow>(
    'SELECT content, source FROM track_lyrics WHERE track_id = ?',
    [trackId],
  );
  if (!row) return null;
  // source 由本模块写入，理论上必在集合内；真出现未知值时按插件来源处理——
  // 它是四处里最「不确定」的一处，将来按来源重取时宁可多取一次。
  const source = SOURCES.includes(row.source as LyricsSource)
    ? (row.source as LyricsSource)
    : 'lyric-plugin';
  return { content: row.content, source };
}

/** `INSERT OR REPLACE`：重新找到的歌词直接盖掉旧的。 */
export async function saveCachedLyrics(
  trackId: string,
  lyrics: FoundLyrics,
  fetchedAt = Date.now(),
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO track_lyrics (track_id, content, source, fetched_at)
     VALUES (?, ?, ?, ?)`,
    [trackId, lyrics.content, lyrics.source, fetchedAt],
  );
}

export async function deleteCachedLyrics(trackId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM track_lyrics WHERE track_id = ?', [trackId]);
}

/**
 * 清空全部歌词缓存。
 *
 * 用于歌词目录变更之后：目录是四处来源里优先级最高的一处，用户换了目录就是在说
 * 「按新目录重新找」；已缓存的其他来源的歌词若不清，新目录里的文件永远盖不过它们。
 */
export async function deleteAllCachedLyrics(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM track_lyrics');
}
