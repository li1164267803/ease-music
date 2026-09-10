// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

/**
 * 歌词的领域类型。
 *
 * 两种形态对应 lyrics-display spec「歌词的呈现」里的两条要求：带时间轴的逐行跟随播放，
 * 不带时间轴的照常显示但不跟随。界面按 `kind` 分支，不需要再去数有没有时间标签。
 */
export type LyricLine = {
  /** 这一行开始的时刻，毫秒。 */
  timeMs: number;
  text: string;
};

export type Lyrics =
  { kind: 'synced'; lines: readonly LyricLine[] } | { kind: 'plain'; text: string };

/**
 * 四处来源的标识（design.md 决策 1 的优先级顺序）。
 *
 * 随歌词一起落库，将来要「按来源重新获取」时才分得开；本次只写不读。
 */
export type LyricsSource = 'directory' | 'embedded' | 'source-plugin' | 'lyric-plugin';

export type FoundLyrics = {
  /** 歌词正文原样：LRC 或纯文本。落库的是它，解析在读取时进行。 */
  content: string;
  source: LyricsSource;
};

/**
 * 一次查找的结果。
 *
 * `unreadableFile` 是歌词目录里**匹配上了却读不出**的文件名（非 UTF-8 编码）。
 * design.md 决策 6 要求把这件事明确告诉用户而不是静默当作没找到，因此它要一路
 * 带到界面，而不是在来源层就被吞成 null。
 */
export type LyricsLookup =
  | { status: 'found'; lyrics: Lyrics; source: LyricsSource }
  | { status: 'not-found'; unreadableFile: string | null };
