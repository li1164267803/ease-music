// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

export type Playlist = {
  id: string;
  name: string;
  createdAt: number;
  /** 歌单内曲目数量。列表页需要它，单独查一次计数比取全部曲目再数便宜得多。 */
  trackCount: number;
  /**
   * 歌单封面：取第一首带封面的曲目。设计稿的歌单网格是一屏封面，
   * 为它单独取一次比在列表页把每个歌单的曲目全查出来便宜得多。
   */
  coverUri: string | null;
  /** 歌单总时长，用于「32 首 · 2 小时 14 分」。曲目未解析出时长时为 null。 */
  durationMs: number | null;
};

/** 歌单名称的合法性判断。playlist spec 要求拒绝空白名称。 */
export function normalizePlaylistName(raw: string): string | null {
  const name = raw.trim();
  return name.length > 0 ? name : null;
}
