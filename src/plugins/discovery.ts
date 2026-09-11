// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { CandidateTrack } from '@/domain/model/candidate-track';
import { toCandidateTrack } from '@/plugins/candidate';
import { invokePlugin } from '@/plugins/host/invoke';
import type { LoadedPlugin } from '@/plugins/host/loader';
import type { PluginMediaItem } from '@/plugins/protocol';
import { parsePage, type PluginPage } from '@/plugins/search';

/**
 * 发现层：榜单与推荐歌单（add-plugin-discovery-charts/design.md 决策 5）。
 *
 * 每个协议方法一对 `call` / `parse`，全部经 `invokePlugin` 走同一条调用通道；本文件
 * 不做任何 try/catch 之外的兜底——未实现、抛错、超时、畸形四类故障都由通道归因为
 * `PluginCallError`，单个插件的失败由界面按插件分区呈现。
 *
 * 榜单项、歌单项、标签是插件自己的凭据：宿主只读取展示所需的几个字段，`raw` 原样保留，
 * 下一步调用时整个交回插件——它们内部可能带着插件选接口用的私有字段（spike 实测
 * 小蜗音乐的标签带 `digest`），宿主不解释也不裁剪。
 */

/** 榜单项或歌单项。两者在协议里同构，宿主用同一种展示对象承载。 */
export type DiscoveryItem = {
  id: string;
  title: string;
  artworkUri: string | null;
  description: string | null;
  raw: PluginMediaItem;
};

/** 推荐歌单的标签。 */
export type DiscoveryTag = {
  id: string;
  title: string;
  raw: PluginMediaItem;
};

/** 插件返回的分组。`pinned` 标签合并进来时没有标题。 */
export type DiscoveryGroup<T> = { title: string | null; items: T[] };

/** 候选曲目分页页要调用的方法。第二片的专辑、艺人详情在这里再加两个值（决策 3）。 */
export type TrackListKind = 'toplist' | 'sheet';

export type DiscoveryPage<T> = { items: T[]; isEnd: boolean };

export function fetchTopLists(plugin: LoadedPlugin): Promise<DiscoveryGroup<DiscoveryItem>[]> {
  const { meta, instance } = plugin;
  return invokePlugin({
    platform: meta.platform,
    method: 'getTopLists',
    call: instance.getTopLists && (() => instance.getTopLists?.()),
    parse: (raw) => (Array.isArray(raw) ? parseGroups(raw, toItem) : null),
  });
}

export function fetchSheetTags(plugin: LoadedPlugin): Promise<DiscoveryGroup<DiscoveryTag>[]> {
  const { meta, instance } = plugin;
  return invokePlugin({
    platform: meta.platform,
    method: 'getRecommendSheetTags',
    call: instance.getRecommendSheetTags && (() => instance.getRecommendSheetTags?.()),
    parse: (raw) => {
      if (!isRecord(raw) || !Array.isArray(raw.data)) return null;
      const groups = parseGroups(raw.data, toTag);
      // 置顶标签合并为一个无标题分组放在最前
      const pinned = Array.isArray(raw.pinned) ? parseItems(raw.pinned, toTag) : [];
      return pinned.length > 0 ? [{ title: null, items: pinned }, ...groups] : groups;
    },
  });
}

/** 标签下的歌单。返回形状与搜索同形（`{ isEnd?, data }`），`isEnd` 的缺省推断也沿用 `parsePage`。 */
export async function fetchSheetsByTag(
  plugin: LoadedPlugin,
  tag: DiscoveryTag,
  page: number,
): Promise<DiscoveryPage<DiscoveryItem>> {
  const { meta, instance } = plugin;
  const result = await invokePlugin({
    platform: meta.platform,
    method: 'getRecommendSheetsByTag',
    call:
      instance.getRecommendSheetsByTag && (() => instance.getRecommendSheetsByTag?.(tag.raw, page)),
    parse: parsePage,
  });
  return { items: parseItems(result.items, toItem), isEnd: result.isEnd };
}

/** 榜单或歌单的一页曲目。畸形条目丢弃、其余继续（plugin-source spec）。 */
export async function fetchTrackPage(
  plugin: LoadedPlugin,
  kind: TrackListKind,
  item: DiscoveryItem,
  page: number,
): Promise<DiscoveryPage<CandidateTrack>> {
  const { meta, instance } = plugin;
  const method = kind === 'toplist' ? 'getTopListDetail' : 'getMusicSheetInfo';
  const result = await invokePlugin({
    platform: meta.platform,
    method,
    call: instance[method] && (() => instance[method]?.(item.raw, page)),
    parse: parseTrackPage,
  });

  const candidates: CandidateTrack[] = [];
  for (const entry of result.items) {
    const candidate = toCandidateTrack(meta, entry);
    if (candidate) candidates.push(candidate);
  }
  return { items: candidates, isEnd: result.isEnd };
}

/**
 * 榜单详情与歌单详情的形状校验：曲目在 `musicList`，而不是搜索的 `data`。
 *
 * `isEnd` 缺省视为**已到底**，与 `parsePage`「结果为空才算到底」相反（决策 5）。spike
 * 实测：不分页的插件不给 `isEnd`，且对任何页码都返回同一整页——按搜索的规则会无休止地
 * 把同一页追加下去；会分页的插件都给了它。
 */
export function parseTrackPage(raw: unknown): PluginPage | null {
  if (!isRecord(raw) || !Array.isArray(raw.musicList)) return null;
  return { items: raw.musicList, isEnd: typeof raw.isEnd === 'boolean' ? raw.isEnd : true };
}

function parseGroups<T>(
  raw: unknown[],
  convert: (entry: unknown) => T | null,
): DiscoveryGroup<T>[] {
  const groups: DiscoveryGroup<T>[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || !Array.isArray(entry.data)) continue;
    const items = parseItems(entry.data, convert);
    // 空分组整组丢弃：一个只有标题的区块对用户没有任何信息
    if (items.length > 0) groups.push({ title: readString(entry.title), items });
  }
  return groups;
}

function parseItems<T>(raw: unknown[], convert: (entry: unknown) => T | null): T[] {
  const items: T[] = [];
  for (const entry of raw) {
    const item = convert(entry);
    if (item) items.push(item);
  }
  return items;
}

/** `id` 与 `title` 缺一即丢弃该条；其余可空。 */
function toItem(raw: unknown): DiscoveryItem | null {
  if (!isRecord(raw)) return null;
  const id = readId(raw.id);
  const title = readString(raw.title);
  if (!id || !title) return null;
  return {
    id,
    title,
    // 协议里榜单项的封面叫 coverImg、歌单项叫 artwork，两个字段名都是协议事实而非对
    // 个别插件的兼容（spike 实测：网易两者都给，小蜗榜单用前者、歌单用后者）
    artworkUri: readString(raw.coverImg) ?? readString(raw.artwork),
    description: readString(raw.description),
    raw,
  };
}

function toTag(raw: unknown): DiscoveryTag | null {
  if (!isRecord(raw)) return null;
  const id = readId(raw.id);
  const title = readString(raw.title);
  return id && title ? { id, title, raw } : null;
}

/** 条目的 id 在样本插件里既有字符串也有数字（spike 记录），两者都认。 */
function readId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return readString(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
