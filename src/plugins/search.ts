// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { CandidateTrack } from '@/domain/model/candidate-track';
import type { PluginSearchOutcome } from '@/plugins/api';
import { toCandidateTrack } from '@/plugins/candidate';
import { toArtist, toItem, type DiscoveryArtist, type DiscoveryItem } from '@/plugins/discovery';
import { PluginCallError, invokePlugin } from '@/plugins/host/invoke';
import type { LoadedPlugin } from '@/plugins/host/loader';
import { parsePage, type PluginPage } from '@/plugins/host/pages';
import { searchablePlugins } from '@/plugins/manager';
import type { ContentSearchType, PluginMeta } from '@/plugins/protocol';

/**
 * 跨插件搜索。
 *
 * 四种类型共用一套并发、游标与失败归因（add-plugin-discovery-albums-artists/design.md
 * 决策 2），只是条目的转换函数不同：歌曲转成候选曲目，专辑与歌单转成发现层的条目，
 * 艺人转成艺人。
 */

export type SearchFailure = { platform: string; reason: string };

type SearchPageOf<T> = {
  items: T[];
  /** 尚未取完的插件。下一页把它原样传回即可。为空表示到底了。 */
  continuing: string[];
  /** 失败的插件与原因。单个插件失败不影响其余插件的结果。 */
  failures: SearchFailure[];
};

/** 一页搜索结果，按类型区分条目的形状。 */
export type SearchPage =
  | ({ type: 'music' } & SearchPageOf<CandidateTrack>)
  | ({ type: 'album' | 'sheet' } & SearchPageOf<DiscoveryItem>)
  | ({ type: 'artist' } & SearchPageOf<DiscoveryArtist>);

/**
 * 取一页搜索结果。
 *
 * 做成无状态的函数而不是有生命周期的会话对象：调用方持有 `continuing` 作为游标，
 * 翻页就是带着它再调一次。会话对象要处理「关键词变了」「插件被卸载了」这些失效场景，
 * 而这些状态本来就在界面手里。
 *
 * @param platforms 限定本次要查的插件。缺省为全部已安装且支持该类型的插件。
 */
export async function searchPlugins(
  query: string,
  page: number,
  type: ContentSearchType,
  platforms?: readonly string[],
): Promise<SearchPage> {
  switch (type) {
    case 'music':
      return { type, ...(await searchAs(query, page, type, toCandidateTrack, platforms)) };
    case 'artist':
      return { type, ...(await searchAs(query, page, type, toArtist, platforms)) };
    default:
      return { type, ...(await searchAs(query, page, type, toItem, platforms)) };
  }
}

/** 门面用的歌曲搜索：形状固定为候选曲目（`PluginsFacade.search` 的契约）。 */
export async function searchMusic(
  query: string,
  page: number,
  platforms?: readonly string[],
): Promise<PluginSearchOutcome> {
  const { items, continuing, failures } = await searchAs(
    query,
    page,
    'music',
    toCandidateTrack,
    platforms,
  );
  return { candidates: items, continuing, failures };
}

async function searchAs<T>(
  query: string,
  page: number,
  type: ContentSearchType,
  convert: (meta: PluginMeta, raw: unknown) => T | null,
  platforms?: readonly string[],
): Promise<SearchPageOf<T>> {
  const targets = searchablePlugins(type).filter(
    (plugin) => !platforms || platforms.includes(plugin.meta.platform),
  );

  const outcome: SearchPageOf<T> = { items: [], continuing: [], failures: [] };

  // 并发发起。一个插件慢不该拖住其他插件的结果，也不该让用户按插件数量线性等待。
  const results = await Promise.all(targets.map((plugin) => searchOne(plugin, query, page, type)));

  for (const [index, result] of results.entries()) {
    const plugin = targets[index];
    if (!plugin) continue;

    if ('reason' in result) {
      outcome.failures.push({ platform: plugin.meta.platform, reason: result.reason });
      continue;
    }

    for (const raw of result.items) {
      const item = convert(plugin.meta, raw);
      // 畸形条目直接丢弃，继续处理其余结果（plugin-source spec）
      if (item) outcome.items.push(item);
    }
    if (!result.isEnd) outcome.continuing.push(plugin.meta.platform);
  }

  return outcome;
}

async function searchOne(
  plugin: LoadedPlugin,
  query: string,
  page: number,
  type: ContentSearchType,
): Promise<PluginPage | { reason: string }> {
  const { meta, instance } = plugin;
  try {
    return await invokePlugin<PluginPage>({
      platform: meta.platform,
      method: 'search',
      call: instance.search && (() => instance.search?.(query, page, type)),
      parse: parsePage,
    });
  } catch (error) {
    return { reason: error instanceof PluginCallError ? error.message : describe(error) };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
