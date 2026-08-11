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
