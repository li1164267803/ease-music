// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { LyricLine, Lyrics } from '@/lyrics/model';

/**
 * `.lrc` 解析（design.md 决策 5：自己写，不引依赖）。
 *
 * 认的规则只有三条：时间标签 `[mm:ss]`、`[mm:ss.xx]`、`[mm:ss.xxx]`；一个标签的词是它
 * 后面到下一个标签为止的文本，相邻的标签共享后面那句词（`[a][b]词` 是同一句在两处
 * 重复）；`[ti:]` `[ar:]` 这类元信息标签忽略。解析后按时间排序，乱序或重复的时间戳
 * 按原样处理，不猜用户意图（design.md Non-Goals）。
 *
 * 「按标签切」而不是「按行切」：实测歌词网插件把整篇 LRC 的换行去掉后返回，
 * `[t1]词1[t2]词2…` 全挤在一行。按行切会把它读成「所有时刻都是最后一句」，按标签切
 * 两种写法都对，且不需要知道正文来自哪个插件。
 *
 * 整篇没有任何时间标签时按纯文本返回——这不是解析失败，是歌词本来就没有时间轴。
 */
const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** 只含时间标签、没有正文的行（如 `[00:00.00]`）在很多 LRC 里用来标记间奏，照常保留为空行。 */
export function parseLrc(raw: string): Lyrics {
  const lines: LyricLine[] = [];
  let sawTimeTag = false;

  for (const rawLine of raw.split(/\r\n|\r|\n/)) {
    const tags = [...rawLine.matchAll(TIME_TAG)];
    if (tags.length === 0) continue;
    sawTimeTag = true;

    // 从后往前扫：每个标签先取自己后面那段文本，为空就沿用后一个标签的词。
    let text = '';
    for (let index = tags.length - 1; index >= 0; index -= 1) {
      const tag = tags[index];
      if (!tag) continue;
      const nextStart = tags[index + 1]?.index ?? rawLine.length;
      const own = rawLine.slice(tag.index + tag[0].length, nextStart).trim();
      if (own || index === tags.length - 1) text = own;
      lines.unshift({ timeMs: toMs(tag[1], tag[2], tag[3]), text });
    }
  }

  if (!sawTimeTag) return { kind: 'plain', text: raw.trim() };

  lines.sort((left, right) => left.timeMs - right.timeMs);
  return { kind: 'synced', lines };
}

/**
 * 小数部分按位数解释：两位是百分之一秒（LRC 的原始约定），三位是毫秒。
 * 一位的写法极少见，按十分之一秒处理。
 */
function toMs(minutes: string | undefined, seconds: string | undefined, fraction = ''): number {
  const base = (Number(minutes ?? 0) * 60 + Number(seconds ?? 0)) * 1000;
  if (!fraction) return base;
  return base + Math.round(Number(fraction) * 10 ** (3 - fraction.length));
}

/**
 * 把带时间轴的行序列写回 LRC 文本。
 *
 * 内嵌歌词（ID3 的 SYLT 帧）解析出来就是「时间 + 文本」的数组，落库前统一成 LRC，
 * 缓存表里才只有一种正文形态，读取路径也只有 `parseLrc` 一条。
 */
export function toLrc(lines: readonly { timeMs: number; text: string }[]): string {
  return lines.map((line) => `${formatTag(line.timeMs)}${line.text}`).join('\n');
}

function formatTag(timeMs: number): string {
  const total = Math.max(0, Math.round(timeMs));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `[${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}]`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}
