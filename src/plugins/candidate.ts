// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { CandidateTrack } from '@/domain/model/candidate-track';
import type { SourceRef } from '@/domain/model/track';
import { PRIMARY_KEY_SEPARATOR, type PluginMediaItem, type PluginMeta } from '@/plugins/protocol';

/** 曲目原始条目在 `sourceRef` 中的存放位置。解析播放地址时原样回传给插件。 */
const ITEM_FIELD = 'item';

/**
 * 插件返回的条目 → 候选曲目。
 *
 * 不合契约的条目返回 null，由调用方丢弃并继续处理其余结果（plugin-source spec
 * 「插件返回畸形数据」）。丢弃的判定只有两条：拼不出主键、没有标题。其余字段缺失都
 * 走曲库统一的降级规则，不构成丢弃理由——插件生态里字段残缺是常态，判得太严会把
 * 大量可用结果挡掉。
 */
export function toCandidateTrack(meta: PluginMeta, raw: unknown): CandidateTrack | null {
  if (!isRecord(raw)) return null;

  const sourceKey = deriveSourceKey(meta, raw);
  if (!sourceKey) return null;

  const title = readString(raw.title);
  if (!title) return null;

  return {
    sourceId: meta.platform,
    sourceKey,
    sourceRef: { [ITEM_FIELD]: raw } satisfies SourceRef,
    title,
    artist: readString(raw.artist),
    album: readString(raw.album),
    // 协议的 duration 以**秒**计，曲库以毫秒计
    durationMs: readDurationMs(raw.duration),
    trackNumber: readNumber(raw.track),
    // 只认协议规定的 artwork 字段。个别插件用的非标准字段名（coverImg 之类）不在这里
    // 逐个兼容——那属于真实插件的兼容性摸底（tasks 11.5）的产物，凭猜测加分支只会
    // 留下一堆没人能说清来由的字段名。
    artworkUri: readString(raw.artwork),
  };
}

/**
 * 按插件声明的 `primaryKey` 顺序拼接出 `sourceKey`（design.md 决策 4）。
 *
 * 顺序与分隔符都必须固定：`sourceKey` 参与曲库去重键，同一首歌两次搜索必须拼出
 * 同一个值，否则会产生重复记录。任一主键字段缺失即判定为畸形条目——缺了主键的条目
 * 本来也无法在下次播放时被插件重新解析。
 */
function deriveSourceKey(meta: PluginMeta, raw: Record<string, unknown>): string | null {
  const parts: string[] = [];
  for (const field of meta.primaryKey) {
    const value = raw[field];
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const text = String(value);
    if (!text) return null;
    parts.push(text);
  }
  return parts.length > 0 ? parts.join(PRIMARY_KEY_SEPARATOR) : null;
}

/** 从曲目记录里取回插件的原始条目，用于重新解析播放地址。 */
export function readPluginItem(sourceRef: SourceRef): PluginMediaItem | null {
  const item = sourceRef[ITEM_FIELD];
  return isRecord(item) ? item : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * 协议规定 `duration` 的单位是**秒**，宿主严格按此解释。
 *
 * 实测有插件返回毫秒（见 tasks.md 11.5 的记录），表现是时长显示成一个荒谬的数字。
 * 这里**刻意不做单位猜测**：一旦开始为个别插件的越界行为写兜底，「协议说了什么」
 * 就不再是唯一依据，后面每遇到一个不守规范的插件都要再加一层猜测，而每层猜测都会在
 * 守规范的插件上制造新的误判。不合规范的插件由插件侧修正。
 */
function readDurationMs(value: unknown): number | null {
  const seconds = readNumber(value);
  return seconds === null || seconds <= 0 ? null : Math.round(seconds * 1000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
