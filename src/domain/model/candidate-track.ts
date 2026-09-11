// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { NewTrack, SourceId, SourceRef } from '@/domain/model/track';

/**
 * 尚未加入曲库的曲目（design.md 决策 3）。
 *
 * 来源的搜索/浏览结果先以本类型呈现，用户选择「加入曲库」时才生成 `Track`。
 * 它不落库，只存在于结果列表与入库动作之间。
 *
 * **刻意不复用 `Track`**：`Track` 的语义是「曲库里的一条记录」——有本地 id、有加入
 * 时间、参与歌单关系。把这些字段改成可空以容纳搜索结果，会让「这条记录到底入没入库」
 * 的判断散布到每个消费 `Track` 的地方，编译器也不再能保证「拿到 Track 就是入库的」。
 */
export type CandidateTrack = {
  /** 提供该结果的来源标识。插件曲目即插件名。 */
  sourceId: SourceId;
  /** 曲目在该来源内的唯一标识，与 sourceId 组成去重键。 */
  sourceKey: string;
  /** 重新解析所需的信息，入库后原样写进曲目记录。 */
  sourceRef: SourceRef;

  title: string;
  artist: string | null;
  album: string | null;
  durationMs: number | null;
  trackNumber: number | null;
  /** 来源提供的封面地址，通常是远程 URL。 */
  artworkUri: string | null;
};

/** 结果列表的稳定 key。同一曲目在不同来源下是不同条目，因此必须带上来源。 */
export function candidateKey(candidate: CandidateTrack): string {
  return `${candidate.sourceId}:${candidate.sourceKey}`;
}

/**
 * 候选曲目 → 入库参数。
 *
 * 转换是纯粹的字段搬运，没有任何来源特有的处理——这正是「入库后与本地文件曲目同权」
 * （plugin-source spec）在数据层面的含义：曲库拿到的是同一种记录。
 */
export function toNewTrack(candidate: CandidateTrack): NewTrack {
  return {
    sourceId: candidate.sourceId,
    sourceKey: candidate.sourceKey,
    sourceRef: candidate.sourceRef,
    title: candidate.title,
    artist: candidate.artist,
    album: candidate.album,
    durationMs: candidate.durationMs,
    trackNumber: candidate.trackNumber,
    artworkUri: candidate.artworkUri,
  };
}

/**
 * 一个列表来源交出的整批候选曲目。
 *
 * 生产者不止一个：插件发现层逐页取到 `isEnd`，播放列表导入解析一个 m3u 文件。
 * 两者都要回答「拿到了哪些、有哪些没能拿到」，因此这个形状属于 domain 层而不是
 * 任何一个生产者（add-m3u-import/design.md 决策 6）。
 */
export type CollectedTracks = {
  items: CandidateTrack[];
  /** 取页触顶，列表只取了前一部分。 */
  truncated: boolean;
  /**
   * 识别出来但无法入库的条目。与 `truncated` 是同一类信息——都在说「有一部分没能
   * 进来」——放在一起用户才能在同一屏上看清要入库多少、没能入库多少（决策 7）。
   * 插件侧不产生这类条目，故为可选。
   */
  skipped?: SkippedEntry[];
};

/** 被跳过的一条。`line` 是原文中那一行，便于用户回去查。 */
export type SkippedEntry = { line: string; reason: string };
