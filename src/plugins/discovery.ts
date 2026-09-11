// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { CandidateTrack, CollectedTracks } from '@/domain/model/candidate-track';
import { toCandidateTrack } from '@/plugins/candidate';
import { invokePlugin } from '@/plugins/host/invoke';
import type { LoadedPlugin } from '@/plugins/host/loader';
import { parsePage, parseTrackPage } from '@/plugins/host/pages';
import type { PluginMediaItem, PluginMeta } from '@/plugins/protocol';

/**
 * 发现层：榜单、推荐歌单、专辑、艺人（add-plugin-discovery-charts/design.md 决策 5，
 * add-plugin-discovery-albums-artists/design.md 决策 4–6），以及取完整个列表与链接导入
 * （add-plugin-discovery-import/design.md 决策 2、6）。
 *
 * 每个协议方法一对 `call` / `parse`，全部经 `invokePlugin` 走同一条调用通道；本文件
 * 不做任何 try/catch 之外的兜底——未实现、抛错、超时、畸形四类故障都由通道归因为
 * `PluginCallError`，单个插件的失败由界面按插件分区呈现。
 *
 * 榜单项、歌单项、专辑项、艺人项、标签是插件自己的凭据：宿主只读取展示所需的几个字段，
 * `raw` 原样保留，下一步调用时整个交回插件——它们内部可能带着插件选接口用的私有字段
 * （spike 实测小蜗音乐的标签带 `digest`），宿主不解释也不裁剪。
 */

/** 榜单项、歌单项或专辑项。三者在协议里同构，宿主用同一种展示对象承载。 */
export type DiscoveryItem = {
  /** 提供该条目的插件。凭据只对它有意义；跨插件的列表（搜索结果）也靠它区分同名条目。 */
  platform: string;
  id: string;
  title: string;
  artworkUri: string | null;
  description: string | null;
  raw: PluginMediaItem;
};

/** 艺人。协议里用 `name` 与 `avatar`，与条目的 `title` / `artwork` 不同，因此是另一种展示对象。 */
export type DiscoveryArtist = {
  platform: string;
  id: string;
  name: string;
  avatarUri: string | null;
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

/** 候选曲目分页页要调用的方法。 */
export type TrackListKind = 'toplist' | 'sheet' | 'album' | 'artist';

/** 条目分页列表要调用的方法：标签下的歌单，或艺人的专辑。 */
export type ItemListKind = 'sheet-tag' | 'artist-album';

export type DiscoveryPage<T> = { items: T[]; isEnd: boolean };

/** 列表的稳定 key。同一 id 在不同插件下是不同条目，因此必须带上插件。 */
export function discoveryKey(entry: { platform: string; id: string }): string {
  return `${entry.platform}:${entry.id}`;
}

/** 只需要凭据的参数：任何一种展示对象都行。 */
type Credential = { raw: PluginMediaItem };

export function fetchTopLists(plugin: LoadedPlugin): Promise<DiscoveryGroup<DiscoveryItem>[]> {
  const { meta, instance } = plugin;
  return invokePlugin({
    platform: meta.platform,
    method: 'getTopLists',
    call: instance.getTopLists && (() => instance.getTopLists?.()),
    parse: (raw) => (Array.isArray(raw) ? parseGroups(raw, (entry) => toItem(meta, entry)) : null),
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

/**
 * 一页条目：标签下的歌单，或艺人的专辑。两个方法的返回都与搜索同形（`{ isEnd?, data }`），
 * `isEnd` 的缺省推断沿用 `parsePage`。
 */
export async function fetchItemPage(
  plugin: LoadedPlugin,
  kind: ItemListKind,
  source: Credential,
  page: number,
): Promise<DiscoveryPage<DiscoveryItem>> {
  const { meta, instance } = plugin;
  const result =
    kind === 'sheet-tag'
      ? await invokePlugin({
          platform: meta.platform,
          method: 'getRecommendSheetsByTag',
          call:
            instance.getRecommendSheetsByTag &&
            (() => instance.getRecommendSheetsByTag?.(source.raw, page)),
          parse: parsePage,
        })
      : await invokePlugin({
          platform: meta.platform,
          method: 'getArtistWorks',
          call:
            instance.getArtistWorks && (() => instance.getArtistWorks?.(source.raw, page, 'album')),
          parse: parsePage,
        });
  return { items: parseItems(result.items, (entry) => toItem(meta, entry)), isEnd: result.isEnd };
}

/** 曲目在 `musicList` 里的三个详情方法。艺人作品的曲目在 `data` 里，单独处理。 */
const TRACK_LIST_METHODS = {
  toplist: 'getTopListDetail',
  sheet: 'getMusicSheetInfo',
  album: 'getAlbumInfo',
} as const;

/** 一页曲目。畸形条目丢弃、其余继续（plugin-source spec）。 */
export async function fetchTrackPage(
  plugin: LoadedPlugin,
  kind: TrackListKind,
  item: Credential,
  page: number,
): Promise<DiscoveryPage<CandidateTrack>> {
  const { meta, instance } = plugin;
  const result =
    kind === 'artist'
      ? await invokePlugin({
          platform: meta.platform,
          method: 'getArtistWorks',
          call:
            instance.getArtistWorks && (() => instance.getArtistWorks?.(item.raw, page, 'music')),
          parse: parsePage,
        })
      : await invokePlugin({
          platform: meta.platform,
          method: TRACK_LIST_METHODS[kind],
          call:
            instance[TRACK_LIST_METHODS[kind]] &&
            (() => instance[TRACK_LIST_METHODS[kind]]?.(item.raw, page)),
          parse: parseTrackPage,
        });

  return { items: toCandidates(meta, result.items), isEnd: result.isEnd };
}

/**
 * 取完整个列表的页数上限（add-plugin-discovery-import/design.md 决策 2）。
 * 只防「插件永远回 isEnd: false」这一种情况；触顶时把已取部分交出去并标明被截断。
 */
export const MAX_PAGES = 100;

/**
 * 逐页取到 `isEnd`，供「全部加入歌单」使用。任一页失败即中止并抛出——半个列表悄悄入库
 * 比报错重试更糟（plugin-discovery spec「取页中途失败」）；错误文案里带上页码，用户才知道
 * 是取到哪一步出的问题。
 */
export async function collectTracks(
  plugin: LoadedPlugin,
  kind: TrackListKind,
  item: Credential,
  onProgress?: (page: number) => void,
): Promise<CollectedTracks> {
  const items: CandidateTrack[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    onProgress?.(page);
    let result: DiscoveryPage<CandidateTrack>;
    try {
      result = await fetchTrackPage(plugin, kind, item, page);
    } catch (error) {
      throw new Error(`取第 ${page} 页时失败：${describe(error)}`, { cause: error });
    }
    items.push(...result.items);
    if (result.isEnd) return { items, truncated: false };
  }
  return { items, truncated: true };
}

/**
 * 链接导入的结果。「不识别」是协议的合法回答（插件对不属于自己的输入返回假值），
 * 与畸形数据分开归因（add-plugin-discovery-import/design.md 决策 6）。
 */
export type ImportOutcome = { recognized: false } | { recognized: true; items: CandidateTrack[] };

/** 导入外部歌单链接：插件返回曲目数组，畸形条目丢弃、其余保留。 */
export function importSheet(plugin: LoadedPlugin, urlLike: string): Promise<ImportOutcome> {
  const { meta, instance } = plugin;
  return invokePlugin({
    platform: meta.platform,
    method: 'importMusicSheet',
    call: instance.importMusicSheet && (() => instance.importMusicSheet?.(urlLike)),
    parse: (raw) => {
      if (!raw) return { recognized: false };
      return Array.isArray(raw) ? { recognized: true, items: toCandidates(meta, raw) } : null;
    },
  });
}

/** 导入单曲链接：插件返回一个曲目条目。条目拼不出主键或没有标题时按畸形处理。 */
export function importItem(plugin: LoadedPlugin, urlLike: string): Promise<ImportOutcome> {
  const { meta, instance } = plugin;
  return invokePlugin({
    platform: meta.platform,
    method: 'importMusicItem',
    call: instance.importMusicItem && (() => instance.importMusicItem?.(urlLike)),
    parse: (raw) => {
      if (!raw) return { recognized: false };
      const candidate = toCandidateTrack(meta, raw);
      return candidate ? { recognized: true, items: [candidate] } : null;
    },
  });
}

/** 畸形条目丢弃、其余继续（plugin-source spec）。 */
function toCandidates(meta: PluginMeta, raw: unknown[]): CandidateTrack[] {
  const candidates: CandidateTrack[] = [];
  for (const entry of raw) {
    const candidate = toCandidateTrack(meta, entry);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
export function toItem(meta: PluginMeta, raw: unknown): DiscoveryItem | null {
  if (!isRecord(raw)) return null;
  const id = readId(raw.id);
  const title = readString(raw.title);
  if (!id || !title) return null;
  return {
    platform: meta.platform,
    id,
    title,
    // 协议里榜单项的封面叫 coverImg、歌单与专辑项叫 artwork，两个字段名都是协议事实而非
    // 对个别插件的兼容（spike 实测：网易两者都给，小蜗榜单用前者、歌单用后者）
    artworkUri: readString(raw.coverImg) ?? readString(raw.artwork),
    description: readString(raw.description),
    raw,
  };
}

/** `id` 与 `name` 缺一即丢弃该条。 */
export function toArtist(meta: PluginMeta, raw: unknown): DiscoveryArtist | null {
  if (!isRecord(raw)) return null;
  const id = readId(raw.id);
  const name = readString(raw.name);
  if (!id || !name) return null;
  return {
    platform: meta.platform,
    id,
    name,
    avatarUri: readString(raw.avatar),
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
