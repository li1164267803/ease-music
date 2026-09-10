// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { TimestampFormat } from 'music-metadata';

import { loadLyricsDirectory } from '@/domain/settings';
import type { Track } from '@/domain/model/track';
import { parseAudioMetadata } from '@/library/metadata';
import { findInLyricsDirectory } from '@/lyrics/directory';
import { toLrc } from '@/lyrics/lrc';
import type { FoundLyrics } from '@/lyrics/model';
import { Plugins } from '@/plugins';
import { localFileUri } from '@/sources/local-file';

/**
 * 四处来源的统一取法，按 design.md 决策 1 的优先级取第一个成功的：
 *
 *   歌词目录 > 内嵌 > 来源插件 > 歌词类插件
 *
 * 越是用户主动准备的越优先；来源插件拿到的是精确曲目，排在按标题模糊匹配的歌词类
 * 插件之前。任何一处**失败**都不中断其余来源，也不会抛出——歌词是「有则显示」的东西，
 * 一处出错的正确表现是换下一处找，而不是让播放页出现一个错误。
 *
 * 唯一的例外是「目录里有文件但不是 UTF-8」：那不是失败，是找到了却读不出，见
 * `FetchOutcome` 的说明。
 */
export type FetchOutcome =
  | { status: 'found'; found: FoundLyrics }
  | { status: 'not-found' }
  /**
   * 歌词目录里匹配上了、却不是 UTF-8 编码。**到此为止，不再往下找**：这是用户亲手放的、
   * 优先级最高的那份词，若继续往下找并把别处的词缓存起来，他把文件另存为 UTF-8 之后
   * 也永远看不到自己那份——缓存命中在前，目录根本不会再被查。实测正是这样：一份 GBK
   * 文件被跳过后，歌词类插件按标题搜到了另一首歌的词并缓存了。
   */
  | { status: 'unreadable'; fileName: string };

export async function fetchLyrics(track: Track): Promise<FetchOutcome> {
  const fromDirectory = await attempt(() => fromLyricsDirectory(track));
  if (fromDirectory?.status === 'found') {
    return { status: 'found', found: { content: fromDirectory.content, source: 'directory' } };
  }
  if (fromDirectory?.status === 'unreadable') {
    return { status: 'unreadable', fileName: fromDirectory.fileName };
  }

  const embedded = await attempt(() => fromEmbeddedTags(track));
  if (embedded) return { status: 'found', found: { content: embedded, source: 'embedded' } };

  const fromSourcePlugin = await attempt(() => Plugins.lyricForTrack(track));
  if (fromSourcePlugin) {
    return { status: 'found', found: { content: fromSourcePlugin, source: 'source-plugin' } };
  }

  const fromLyricPlugin = await attempt(() => Plugins.searchLyric(track.title));
  if (fromLyricPlugin) {
    return { status: 'found', found: { content: fromLyricPlugin, source: 'lyric-plugin' } };
  }

  return { status: 'not-found' };
}

async function fromLyricsDirectory(track: Track) {
  // 未指定目录时这一处直接跳过，界面不会因此出现任何错误（lyrics-display spec）。
  const directoryUri = await loadLyricsDirectory();
  if (!directoryUri) return null;
  return findInLyricsDirectory(directoryUri, track.title, track.artist);
}

/**
 * 内嵌歌词：复用导入路径上已经跑通的 `parseAudioMetadata`。
 *
 * 只有本地文件曲目有文件可读。同步歌词（SYLT）转成 LRC 落库，让缓存表里只有一种
 * 正文形态；非同步歌词（USLT）原样作为纯文本。时间戳格式不是毫秒的同步歌词
 * （MPEG 帧号，实际几乎不存在）无法换算，退化为只取文本。
 */
async function fromEmbeddedTags(track: Track): Promise<string | null> {
  const uri = localFileUri(track);
  if (!uri) return null;

  const metadata = await parseAudioMetadata(uri);
  if (!metadata) return null;

  for (const tag of metadata.lyrics) {
    const synced = tag.syncText.filter((line) => line.timestamp != null);
    if (synced.length > 0 && tag.timeStampFormat === TimestampFormat.milliseconds) {
      return toLrc(synced.map((line) => ({ timeMs: line.timestamp ?? 0, text: line.text })));
    }
    const plain =
      tag.text?.trim() ||
      tag.syncText
        .map((line) => line.text)
        .join('\n')
        .trim();
    if (plain) return plain;
  }
  return null;
}

/** 单处来源的失败只进日志，不向上抛。 */
async function attempt<T>(source: () => Promise<T>): Promise<T | null> {
  try {
    return await source();
  } catch (error) {
    console.warn('[lyrics] 某处来源查找失败:', error instanceof Error ? error.message : error);
    return null;
  }
}
