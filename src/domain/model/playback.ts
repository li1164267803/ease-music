// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 琥珀音乐 AmberMusic

/** media-playback spec 要求的四种播放模式。 */
export const PLAY_MODES = ['sequential', 'loopAll', 'loopOne', 'shuffle'] as const;
export type PlayMode = (typeof PLAY_MODES)[number];

export const PLAY_MODE_LABELS: Record<PlayMode, string> = {
  sequential: '顺序播放',
  loopAll: '列表循环',
  loopOne: '单曲循环',
  shuffle: '随机播放',
};

export function isPlayMode(value: unknown): value is PlayMode {
  return typeof value === 'string' && (PLAY_MODES as readonly string[]).includes(value);
}

/** 对外暴露的播放状态。UI 与系统媒体会话都只依赖这一组字段。 */
export type PlaybackState = 'idle' | 'loading' | 'buffering' | 'playing' | 'paused';
