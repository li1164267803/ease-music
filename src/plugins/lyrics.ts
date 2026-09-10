// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { Track } from '@/domain/model/track';
import { readPluginItem } from '@/plugins/candidate';
import { PluginCallError, invokePlugin } from '@/plugins/host/invoke';
import type { LoadedPlugin } from '@/plugins/host/loader';
import { getLoadedPlugin, lyricPlugins } from '@/plugins/manager';
import type { PluginMediaItem } from '@/plugins/protocol';
import { parsePage } from '@/plugins/search';

/**
 * 插件歌词的两条通路（add-lyrics-display/design.md 决策 2）。
 *
 * ```
 * 来源插件      getLyric(该曲目自己的 mediaItem)               一步，精确
 * 歌词类插件    search(标题, 1, 'lyric') → getLyric(候选[0])     两步，按标题匹配
 * ```
 *
 * 两条路的失败都在这里收口成 null：plugin-source spec 要求插件故障不影响宿主、不打扰
 * 用户，而歌词恰好是「取不到就是取不到」的东西——调用方继续找下一处来源即可。
 * 原因只进日志，方便排查插件问题。
 */

/** 来源插件路：曲目属于哪个插件就问哪个，`mediaItem` 就是它自己给出的，不存在配错。 */
export async function lyricForTrack(track: Track): Promise<string | null> {
  const plugin = getLoadedPlugin(track.sourceId);
  if (!plugin) return null;

  const item = readPluginItem(track.sourceRef);
  if (!item) return null;

  return getLyric(plugin, item);
}

/**
 * 歌词类插件路：拿标题去搜，取第一条候选。
 *
 * **串行**而不是并发：并发会让每首歌同时打到所有歌词站点，而只有第一个成功的结果会被
 * 采用，其余请求全是白打——插件来源对频繁请求敏感、代价由用户承担（C2 决策 6 的教训）。
 */
export async function searchLyric(title: string): Promise<string | null> {
  for (const plugin of lyricPlugins()) {
    const candidate = await searchFirstCandidate(plugin, title);
    if (!candidate) continue;

    const lyric = await getLyric(plugin, candidate);
    if (lyric) return lyric;
  }
  return null;
}

async function searchFirstCandidate(
  plugin: LoadedPlugin,
  title: string,
): Promise<PluginMediaItem | null> {
  const { meta, instance } = plugin;
  try {
    const page = await invokePlugin({
      platform: meta.platform,
      method: 'search',
      call: instance.search && (() => instance.search?.(title, 1, 'lyric')),
      parse: parsePage,
    });
    const first = page.items[0];
    return isRecord(first) ? first : null;
  } catch (error) {
    warn(error);
    return null;
  }
}

async function getLyric(plugin: LoadedPlugin, item: PluginMediaItem): Promise<string | null> {
  const { meta, instance } = plugin;
  try {
    return await invokePlugin({
      platform: meta.platform,
      method: 'getLyric',
      call: instance.getLyric && (() => instance.getLyric?.(item)),
      parse: parseLyric,
    });
  } catch (error) {
    warn(error);
    return null;
  }
}

/**
 * 歌词正文取 `rawLrc`——MusicFree 的既有约定，实测三个已安装插件都用它。
 * 字段缺失或不是字符串按「没取到」处理：协议里还有一个指向歌词文件的 `lrc` 地址字段，
 * 本次不跟进——那要再发一次请求，而返回地址不返回正文的插件实测一个都没遇到。
 */
function parseLyric(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const text = raw.rawLrc;
  return typeof text === 'string' && text.trim().length > 0 ? text : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 插件故障只进日志。`PluginCallError` 的 message 已带插件名与方法名。 */
function warn(error: unknown): void {
  const message =
    error instanceof PluginCallError || error instanceof Error ? error.message : String(error);
  console.warn('[lyrics] 插件歌词取用失败:', message);
}
