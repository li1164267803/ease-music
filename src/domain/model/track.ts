// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 琥珀音乐 AmberMusic

/**
 * 来源标识。曲库与播放器只把它当作路由用的字符串，不解释其含义——
 * 新增来源（网盘、插件）时这里加一个值，上层无需改动。
 */
export type SourceId = string;

export const SOURCE_LOCAL_FILE: SourceId = 'local-file';
export const SOURCE_REMOTE_URL: SourceId = 'remote-url';

/**
 * 「该来源重新解析出播放地址所需的信息」。
 *
 * design.md 决策 4 的关键约束：曲目记录保存的是**重新解析所需的信息**，而不是解析结果。
 * 网盘与插件返回的地址有时效性，缓存地址会导致过期后无法播放。
 *
 * 采用开放的键值结构而非固定列，是为了容纳后续来源的额外字段（如 115 网盘的文件 id
 * 与父目录），避免每接一个来源就改一次表结构。字段的含义只有对应来源自己知道。
 */
export type SourceRef = Record<string, unknown>;

export type Track = {
  id: string;
  /** 归属来源。播放时据此路由到对应来源解析地址。 */
  sourceId: SourceId;
  /**
   * 曲目在其来源内的唯一标识。与 `sourceId` 组成去重键——
   * music-library spec 要求「同一来源、同一标识」不产生重复记录。
   */
  sourceKey: string;
  sourceRef: SourceRef;

  title: string;
  artist: string | null;
  album: string | null;
  durationMs: number | null;
  trackNumber: number | null;
  /** 封面缓存文件的 URI。null 表示无内嵌封面，由界面显示统一占位图。 */
  artworkUri: string | null;

  addedAt: number;
  /**
   * 失效标记。media-source spec 要求源文件被删除时「曲目在曲库中被标记为失效
   * 而非静默消失」，用户据此知道发生了什么，也能自行决定是否移除。
   */
  unavailable: boolean;
};

/** 新建曲目时由调用方提供的部分——id 与 addedAt 由仓储层生成。 */
export type NewTrack = Omit<Track, 'id' | 'addedAt' | 'unavailable'>;

export type TrackSortKey = 'title' | 'artist' | 'addedAt';
