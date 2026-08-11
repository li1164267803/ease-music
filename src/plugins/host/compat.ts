// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import Constants from 'expo-constants';

import type { CompatVerdict } from '@/plugins/api';

/**
 * 插件 `appVersion` 声明的兼容性检查。
 *
 * **结论是提示而非拦截**，理由有二：
 *
 * 1. 该字段在既有生态里填的是「适配的 MusicFree 版本」，与本应用的版本号不在同一个
 *    命名空间。拿它去卡本应用的版本会把大量本可正常工作的插件误判为不兼容。
 * 2. plugin-source spec 要求的是「不兼容时明确提示而非静默行为异常」——即用户要知道
 *    存在版本落差，而不是插件被挡在门外。
 *
 * 因此本模块只回答「插件声明的范围是否覆盖当前宿主版本」，由调用方决定如何呈现；
 * 无法解析的范围一律按「不作判断」处理，不因看不懂一段声明就否定一个插件。
 */

export const HOST_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';

export function checkAppVersion(range: string | null): CompatVerdict {
  if (!range) return 'unknown';

  const alternatives = range.split('||');
  let sawParsable = false;

  for (const alternative of alternatives) {
    const comparators = alternative
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean);
    if (comparators.length === 0) continue;

    let allHold = true;
    for (const comparator of comparators) {
      const result = evaluate(comparator, HOST_VERSION);
      if (result === 'unknown') {
        allHold = false;
        break;
      }
      sawParsable = true;
      if (!result) {
        allHold = false;
        break;
      }
    }
    if (allHold) return 'satisfied';
  }

  return sawParsable ? 'not-satisfied' : 'unknown';
}

/**
 * 比较两个版本号。无法解析任一侧时返回 null——调用方据此走「问用户」而不是猜。
 * 供安装同名插件时判断是升级还是降级（plugin-source spec「拒绝静默降级」）。
 */
export function compareVersions(left: string | null, right: string | null): number | null {
  const a = left === null ? null : parseVersion(left);
  const b = right === null ? null : parseVersion(right);
  return a && b ? compare(a, b) : null;
}

function evaluate(comparator: string, host: string): boolean | 'unknown' {
  if (comparator === '*' || comparator === 'x') return true;

  const match = /^(>=|<=|>|<|=|\^|~)?\s*v?(.+)$/.exec(comparator);
  if (!match) return 'unknown';

  const operator = match[1] ?? '=';
  const target = parseVersion(match[2] ?? '');
  const current = parseVersion(host);
  if (!target || !current) return 'unknown';

  const order = compare(current, target);
  switch (operator) {
    case '>':
      return order > 0;
    case '>=':
      return order >= 0;
    case '<':
      return order < 0;
    case '<=':
      return order <= 0;
    case '=':
      return order === 0;
    // ^ 允许同主版本内的更新，~ 允许同次版本内的更新
    case '^':
      return order >= 0 && current.parts[0] === target.parts[0];
    case '~':
      return (
        order >= 0 && current.parts[0] === target.parts[0] && current.parts[1] === target.parts[1]
      );
    default:
      return 'unknown';
  }
}

type ParsedVersion = { parts: [number, number, number]; prerelease: string | null };

function parseVersion(raw: string): ParsedVersion | null {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+](.+))?$/.exec(raw.trim());
  if (!match) return null;
  return {
    parts: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)],
    prerelease: match[4] ?? null,
  };
}

function compare(left: ParsedVersion, right: ParsedVersion): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left.parts[index] ?? 0) - (right.parts[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  // 数字段相同时预发布版本小于正式版本（0.1.0-alpha < 0.1.0）。
  // 不再细比两个预发布标识的先后——`>0.1.0-alpha.0` 这类声明只关心是否越过了该点。
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}
