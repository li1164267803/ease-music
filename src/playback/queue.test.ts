// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

/**
 * 推进规则的单测（fix-playback-failure-handling/design.md 决策 1）。
 *
 * 「自然播完 / 失败跳过 / 用户切歌」在四种播放模式与两个方向上的组合，正是单曲循环下
 * 「界面是 A、发声是 B」那类问题藏身的地方。`step` 是纯函数，在这里穷举，
 * 设备验收只需要确认控制器把正确的原因传了进来。
 *
 * 用法：pnpm test:queue
 */

/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';

import type { PlayMode } from '@/domain/model/playback';
import { buildOrder, step, type AdvanceReason, type PlayOrder } from '@/playback/queue';

const MODES: readonly PlayMode[] = ['sequential', 'loopAll', 'loopOne', 'shuffle'];
const REASONS: readonly AdvanceReason[] = ['finished', 'skipped', 'user'];

/** 随机模式用固定的顺序表，结果才可断言；洗牌本身另测。 */
const SHUFFLED = [2, 0, 3, 1];
const SEQUENTIAL = [0, 1, 2, 3];

function orderAt(mode: PlayMode, position: number): PlayOrder {
  return { order: mode === 'shuffle' ? SHUFFLED : SEQUENTIAL, position };
}

function at(order: PlayOrder, position: number) {
  return { index: order.order[position] as number, position };
}

test('队列中间：除单曲循环自然播完外，一律按方向移动一位', () => {
  for (const mode of MODES) {
    for (const reason of REASONS) {
      const order = orderAt(mode, 1);
      const label = `${mode} / ${reason}`;

      if (mode === 'loopOne' && reason === 'finished') {
        assert.deepEqual(step(order, 1, mode, reason), at(order, 1), `${label} / +1`);
        assert.deepEqual(step(order, -1, mode, reason), at(order, 1), `${label} / -1`);
        continue;
      }

      assert.deepEqual(step(order, 1, mode, reason), at(order, 2), `${label} / +1`);
      assert.deepEqual(step(order, -1, mode, reason), at(order, 0), `${label} / -1`);
    }
  }
});

test('队列末尾向后：顺序模式停止，其余模式绕回首位（单曲循环自然播完除外）', () => {
  for (const mode of MODES) {
    for (const reason of REASONS) {
      const order = orderAt(mode, 3);
      const label = `${mode} / ${reason}`;
      const result = step(order, 1, mode, reason);

      if (mode === 'loopOne' && reason === 'finished') {
        assert.deepEqual(result, at(order, 3), label);
      } else if (mode === 'sequential') {
        assert.equal(result, null, label);
      } else {
        assert.deepEqual(result, at(order, 0), label);
      }
    }
  }
});

test('队列首位向前：顺序模式停止，其余模式绕到末尾（单曲循环自然播完除外）', () => {
  for (const mode of MODES) {
    for (const reason of REASONS) {
      const order = orderAt(mode, 0);
      const label = `${mode} / ${reason}`;
      const result = step(order, -1, mode, reason);

      if (mode === 'loopOne' && reason === 'finished') {
        assert.deepEqual(result, at(order, 0), label);
      } else if (mode === 'sequential') {
        assert.equal(result, null, label);
      } else {
        assert.deepEqual(result, at(order, 3), label);
      }
    }
  }
});

test('单曲循环下失败跳过不停留在失败曲目上', () => {
  const order = orderAt('loopOne', 2);
  assert.deepEqual(step(order, 1, 'loopOne', 'skipped'), { index: 3, position: 3 });
  assert.deepEqual(step(order, -1, 'loopOne', 'skipped'), { index: 1, position: 1 });
});

test('随机模式按顺序表移动，返回的是顺序表里的队列下标', () => {
  const order = orderAt('shuffle', 1);
  assert.deepEqual(step(order, 1, 'shuffle', 'user'), { index: 3, position: 2 });
  assert.deepEqual(step(order, -1, 'shuffle', 'skipped'), { index: 2, position: 0 });
});

test('空队列一律停止', () => {
  const empty: PlayOrder = { order: [], position: -1 };
  for (const mode of MODES) {
    for (const reason of REASONS) {
      assert.equal(step(empty, 1, mode, reason), null, `${mode} / ${reason} / +1`);
      assert.equal(step(empty, -1, mode, reason), null, `${mode} / ${reason} / -1`);
    }
  }
});

test('洗牌得到的顺序表是队列下标的排列，且当前曲目钉在首位', () => {
  const { order, position } = buildOrder(6, 'shuffle', 4);
  assert.equal(position, 0);
  assert.equal(order[0], 4);
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5],
  );
});
