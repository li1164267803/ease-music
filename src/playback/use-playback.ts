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
