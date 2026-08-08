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
