// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

/**
 * 协议里两种「一页结果」的形状校验。搜索、歌词检索、发现层的列表与曲目页都经这里，
 * 各自只决定用哪一种。
 */

export type PluginPage = { items: unknown[]; isEnd: boolean };

/**
 * `{ isEnd?, data }`：搜索结果、标签下的歌单、艺人作品。
 *
 * isEnd 缺省由结果是否为空推断：不少插件只在最后一页才给这个字段，
 * 一律当作「还有下一页」会让界面一直往下翻空页。
 */
export function parsePage(raw: unknown): PluginPage | null {
  if (!isRecord(raw) || !Array.isArray(raw.data)) return null;
  const isEnd = typeof raw.isEnd === 'boolean' ? raw.isEnd : raw.data.length === 0;
  return { items: raw.data, isEnd };
}

/**
 * `{ isEnd?, musicList }`：榜单、歌单、专辑的曲目页。
 *
 * `isEnd` 缺省视为**已到底**，与 `parsePage` 相反（add-plugin-discovery-charts/design.md
 * 决策 5）。spike 实测：不分页的插件不给 `isEnd`，且对任何页码都返回同一整页——按搜索的
 * 规则会无休止地把同一页追加下去；会分页的插件都给了它。
 */
export function parseTrackPage(raw: unknown): PluginPage | null {
  if (!isRecord(raw) || !Array.isArray(raw.musicList)) return null;
  return { items: raw.musicList, isEnd: typeof raw.isEnd === 'boolean' ? raw.isEnd : true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
