// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useEffect, useState, useSyncExternalStore } from 'react';

import { countPlaybackHistory, listRecentlyPlayed, type PlayedTrack } from '@/history/repository';

/**
 * 播放历史变更的广播。
 *
 * **刻意不复用 `notifyLibraryChanged`**：那是全库广播，所有页面收到就重查一遍曲库。
 * 历史每切一首歌就变一次，挂上去等于用户连听十首触发十次全库重查——而这正是
 * design.md 决策 1 拒绝把「最后播放时间」写进 `tracks` 的理由，从广播这一侧
 * 把它放回来就白拒绝了。
 *
 * 本模块**不引用 `@/library/store`**：播放层要在记录成功后发这个广播，而分层约定里
 * 曲库能力不被播放层依赖。三个会改动历史的入口（记一次播放、清空、移除曲目）
 * 各自发一次，界面只需订阅这一个信号。
 */
let revision = 0;
const listeners = new Set<() => void>();

export function notifyHistoryChanged(): void {
  revision += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useRevision(): number {
  return useSyncExternalStore(
    subscribe,
    () => revision,
    () => revision,
  );
}

/** 最近播放的曲目，最近听的排在最前。历史为空时返回空数组。 */
export function useRecentlyPlayed(limit: number): PlayedTrack[] {
  const revision = useRevision();
  const [played, setPlayed] = useState<PlayedTrack[]>([]);

  useEffect(() => {
    let current = true;
    void listRecentlyPlayed(limit).then((result) => {
      if (current) setPlayed(result);
    });
    return () => {
      current = false;
    };
  }, [limit, revision]);

  return played;
}

/** 已记录的历史条数，供「我的」页展示与清空入口的显隐判断。 */
export function useHistoryCount(): number {
  const revision = useRevision();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let current = true;
    void countPlaybackHistory().then((result) => {
      if (current) setCount(result);
    });
    return () => {
      current = false;
    };
  }, [revision]);

  return count;
}
