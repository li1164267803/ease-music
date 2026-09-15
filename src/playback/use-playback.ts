// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useEffect, useSyncExternalStore } from 'react';

import { getSnapshot, initPlayback, subscribe, type PlaybackSnapshot } from '@/playback/player';

/**
 * 订阅播放状态。
 *
 * 播放状态的真相在播放服务里而不是在 React 树里——音频在应用退到后台、界面被系统
 * 回收之后仍在继续。用 useSyncExternalStore 从外部状态源读取，重新挂载的界面自然
 * 就与实际播放状态一致，不需要额外的「恢复」逻辑（media-playback spec 的
 * 「应用被系统回收前台界面」场景）。
 */
export function usePlayback(): PlaybackSnapshot {
  useEffect(() => {
    void initPlayback();
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * 某首曲目是否为当前曲目。
 *
 * 快照返回布尔值而不是整个播放状态，只有「是 / 否」翻转时才触发重渲染：长列表的每一行
 * 各自订阅，播放中每 500ms 一次的进度发布不会让整页或整列跟着重渲染
 * （improve-long-list-scroll/design.md 决策 3）。播放服务由根布局初始化，这里只读状态。
 */
export function useIsCurrentTrack(trackId: string): boolean {
  return useSyncExternalStore(subscribe, () => getSnapshot().currentTrack?.id === trackId);
}

/**
 * 用户想播、引擎却还没发声时的指示文案（fix-playback-failure-handling/design.md 决策 5）。
 *
 * 只在意图为播放时给出：队列为空时的预装载同样处于 `loading`，那不是「正在加载」给用户的反馈。
 */
export function pendingLabel({ state, playWhenReady }: PlaybackSnapshot): string | null {
  if (!playWhenReady) return null;
  if (state === 'loading') return '正在加载…';
  if (state === 'buffering') return '缓冲中…';
  return null;
}
