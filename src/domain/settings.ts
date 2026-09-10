// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import Storage from 'expo-sqlite/kv-store';

import { isPlayMode, type PlayMode } from '@/domain/model/playback';
import type { TrackSortKey } from '@/domain/model/track';

/**
 * 少量配置项的持久化（design.md 决策 6）。
 *
 * 用 `expo-sqlite/kv-store` 而非引入 async-storage：它随 expo-sqlite 一同提供，
 * 不新增依赖——决策 9 要求每个新依赖都要核查许可证，能不加就不加。
 */
const KEYS = {
  playMode: 'settings.playMode',
  librarySort: 'settings.librarySort',
  lyricsDirectory: 'settings.lyricsDirectory',
} as const;

export async function loadPlayMode(): Promise<PlayMode> {
  const raw = await Storage.getItemAsync(KEYS.playMode);
  return isPlayMode(raw) ? raw : 'sequential';
}

export async function savePlayMode(mode: PlayMode): Promise<void> {
  await Storage.setItemAsync(KEYS.playMode, mode);
}

const SORT_KEYS: readonly TrackSortKey[] = ['title', 'artist', 'addedAt'];

export async function loadLibrarySort(): Promise<TrackSortKey> {
  const raw = await Storage.getItemAsync(KEYS.librarySort);
  return SORT_KEYS.includes(raw as TrackSortKey) ? (raw as TrackSortKey) : 'addedAt';
}

export async function saveLibrarySort(sort: TrackSortKey): Promise<void> {
  await Storage.setItemAsync(KEYS.librarySort, sort);
}

/**
 * 用户指定的歌词目录（add-lyrics-display/design.md 决策 3）。存的是目录授权 URI，
 * 未指定时为 null——这是四处歌词来源里唯一需要用户配置的一处，一个字符串不值得建表。
 */
export async function loadLyricsDirectory(): Promise<string | null> {
  const raw = await Storage.getItemAsync(KEYS.lyricsDirectory);
  return raw && raw.length > 0 ? raw : null;
}

/** 传 `null` 表示清除。 */
export async function saveLyricsDirectory(uri: string | null): Promise<void> {
  if (uri) await Storage.setItemAsync(KEYS.lyricsDirectory, uri);
  else await Storage.removeItemAsync(KEYS.lyricsDirectory);
}
