// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { PluginSearchOutcome } from '@/plugins/api';
import { toCandidateTrack } from '@/plugins/candidate';
import { PluginCallError, invokePlugin } from '@/plugins/host/invoke';
import type { LoadedPlugin } from '@/plugins/host/loader';
import { searchablePlugins } from '@/plugins/manager';

/**
 * 跨插件搜索。
 *
 * 本切片只做 `music` 类型：其余类型（专辑、艺人、歌单、歌词）的结果需要跳转到对应
 * 详情页才有意义，与发现层一并留给后续切片（见 proposal.md 的非目标）。
 */
const SEARCH_TYPE = 'music';

type PluginPage = { items: unknown[]; isEnd: boolean };

/**
 * 取一页搜索结果。
 *
 * 做成无状态的函数而不是有生命周期的会话对象：调用方持有 `continuing` 作为游标，
 * 翻页就是带着它再调一次。会话对象要处理「关键词变了」「插件被卸载了」这些失效场景，
 * 而这些状态本来就在界面手里。
 *
 * @param platforms 限定本次要查的插件。缺省为全部已安装且实现了搜索的插件。
 */
export async function searchPlugins(
  query: string,
  page: number,
  platforms?: readonly string[],
): Promise<PluginSearchOutcome> {
  const targets = searchablePlugins().filter(
    (plugin) => !platforms || platforms.includes(plugin.meta.platform),
  );

  const outcome: PluginSearchOutcome = { candidates: [], continuing: [], failures: [] };

  // 并发发起。一个插件慢不该拖住其他插件的结果，也不该让用户按插件数量线性等待。
  const results = await Promise.all(targets.map((plugin) => searchOne(plugin, query, page)));

  for (const [index, result] of results.entries()) {
    const plugin = targets[index];
    if (!plugin) continue;

    if ('reason' in result) {
      outcome.failures.push({ platform: plugin.meta.platform, reason: result.reason });
      continue;
    }

    for (const item of result.items) {
      const candidate = toCandidateTrack(plugin.meta, item);
      // 畸形条目直接丢弃，继续处理其余结果（plugin-source spec）
      if (candidate) outcome.candidates.push(candidate);
    }
    if (!result.isEnd) outcome.continuing.push(plugin.meta.platform);
  }

  return outcome;
}

async function searchOne(
  plugin: LoadedPlugin,
  query: string,
  page: number,
): Promise<PluginPage | { reason: string }> {
  const { meta, instance } = plugin;
  try {
    return await invokePlugin<PluginPage>({
      platform: meta.platform,
      method: 'search',
      call: instance.search && (() => instance.search?.(query, page, SEARCH_TYPE)),
      parse: parsePage,
    });
  } catch (error) {
    return { reason: error instanceof PluginCallError ? error.message : describe(error) };
  }
}

function parsePage(raw: unknown): PluginPage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const result = raw as Record<string, unknown>;

  const data = result.data;
  if (!Array.isArray(data)) return null;

  // isEnd 缺省由结果是否为空推断：不少插件只在最后一页才给这个字段，
  // 一律当作「还有下一页」会让界面一直往下翻空页。
  const isEnd = typeof result.isEnd === 'boolean' ? result.isEnd : data.length === 0;
  return { items: data, isEnd };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
