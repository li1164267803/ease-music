// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 琥珀音乐 AmberMusic

export type Playlist = {
  id: string;
  name: string;
  createdAt: number;
  /** 歌单内曲目数量。列表页需要它，单独查一次计数比取全部曲目再数便宜得多。 */
  trackCount: number;
};

/** 歌单名称的合法性判断。playlist spec 要求拒绝空白名称。 */
export function normalizePlaylistName(raw: string): string | null {
  const name = raw.trim();
  return name.length > 0 ? name : null;
}
