// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 琥珀音乐 AmberMusic

import type { PlayMode } from '@/domain/model/playback';

/**
 * 播放顺序与播放模式的纯逻辑，与播放引擎完全解耦，便于单独推理与验证。
 *
 * 「队列」是曲目的存放顺序（用户在队列页看到的顺序，切换播放模式不改变它）；
 * 「顺序表」是实际的播放次序，随机模式下是队列下标的一个排列。两者分开，
 * 才能做到随机播放时队列页显示的仍是原始顺序——用户对队列的心智模型不该被打乱。
 */
export type PlayOrder = {
  /** 队列下标的播放次序 */
  order: number[];
  /** 当前处在 order 中的第几位 */
  position: number;
};

function shuffled(size: number, pinFirst: number): number[] {
  const indices = Array.from({ length: size }, (_, index) => index).filter(
    (index) => index !== pinFirst,
  );
  // Fisher–Yates
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = indices[i] as number;
    const b = indices[j] as number;
    indices[i] = b;
    indices[j] = a;
  }
  // 当前曲目固定排在首位，避免切到随机模式的瞬间跳走
  return pinFirst >= 0 && pinFirst < size ? [pinFirst, ...indices] : indices;
}

export function buildOrder(size: number, mode: PlayMode, currentIndex: number): PlayOrder {
  if (size === 0) return { order: [], position: -1 };

  if (mode === 'shuffle') {
    const order = shuffled(size, currentIndex);
    return { order, position: currentIndex >= 0 ? 0 : -1 };
  }

  const order = Array.from({ length: size }, (_, index) => index);
  return { order, position: currentIndex };
}

export type StepOptions = {
  /** true 表示曲目自然播完触发，false 表示用户点击上/下一曲 */
  auto: boolean;
};

/**
 * 计算下一个要播放的队列下标。返回 null 表示应当停止播放。
 *
 * 单曲循环只在**自然播完**时重复当前曲目；用户主动点下一曲仍然切歌——
 * 否则「下一曲」这个按钮在该模式下就失去了意义。spec 只规定了播放结束的行为。
 */
export function step(
  { order, position }: PlayOrder,
  direction: 1 | -1,
  mode: PlayMode,
  { auto }: StepOptions,
): { index: number; position: number } | null {
  if (order.length === 0) return null;

  if (mode === 'loopOne' && auto) {
    const index = order[position];
    return index === undefined ? null : { index, position };
  }

  const next = position + direction;

  if (next >= order.length) {
    // 顺序播放到末尾即停止；列表循环与随机回到第一首
    if (mode === 'sequential') return null;
    const index = order[0];
    return index === undefined ? null : { index, position: 0 };
  }

  if (next < 0) {
    // 在第一首上点上一曲：顺序模式停在原地，循环模式绕到末尾
    if (mode === 'sequential') return null;
    const last = order.length - 1;
    const index = order[last];
    return index === undefined ? null : { index, position: last };
  }

  const index = order[next];
  return index === undefined ? null : { index, position: next };
}

/**
 * 队列中移除一项后修正顺序表。
 *
 * media-playback spec：移除当前正在播放的曲目时自动切到下一首；队列空了则停止。
 * 这里只负责下标的重新映射，切歌动作由播放控制器执行。
 */
export function withRemoved({ order, position }: PlayOrder, removedIndex: number): PlayOrder {
  const removedPosition = order.indexOf(removedIndex);
  const remapped = order
    .filter((index) => index !== removedIndex)
    .map((index) => (index > removedIndex ? index - 1 : index));

  if (remapped.length === 0) return { order: [], position: -1 };
  if (removedPosition === -1) return { order: remapped, position };

  // 移除的是当前项之前的曲目，当前项在顺序表中前移一位；
  // 移除的就是当前项时，位置原地不动即指向原来的下一首。
  const nextPosition = removedPosition < position ? position - 1 : position;
  return { order: remapped, position: Math.min(nextPosition, remapped.length - 1) };
}
