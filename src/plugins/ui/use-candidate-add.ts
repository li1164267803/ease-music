// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useState } from 'react';

import { candidateKey, type CandidateTrack } from '@/domain/model/candidate-track';
import { addCandidateTrack } from '@/library/import';
import { notifyLibraryChanged } from '@/library/store';

/**
 * 候选曲目列表的「逐首加入并告知」（fix-android-acceptance-ui-issues/design.md 决策 1）。
 *
 * 「已加入」按曲目 key 由列表持有，不放进行组件：FlashList 会回收复用行。
 * 提示同样属于列表，调用方把 `notice` 放在列表上方——长列表的尾部在屏幕之外。
 */
export function useCandidateAdd() {
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const add = async (candidate: CandidateTrack) => {
    const { duplicate } = await addCandidateTrack(candidate);
    notifyLibraryChanged();
    setAdded((previous) => new Set(previous).add(candidateKey(candidate)));
    // 同一插件同一曲目不产生重复记录，并告知用户（plugin-source spec「重复加入同一曲目」）
    setNotice(duplicate ? `「${candidate.title}」已在曲库中。` : null);
  };

  /** 列表换了一批结果时，上一批的提示不再适用。 */
  const clearNotice = () => setNotice(null);

  return { added, notice, add, clearNotice };
}
