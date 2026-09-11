// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { SkippedEntry } from '@/domain/model/candidate-track';
import { inferTitleFromUrl } from '@/sources/remote-url';

/**
 * m3u / m3u8 播放列表解析（add-m3u-import/design.md 决策 2）。
 *
 * 不碰网络、不碰存储：取回文本与入库都在这个模块之外。本 change 的风险全部集中在
 * 解析本身——编码、相对地址、`#EXTINF` 的方言、HLS 误判——做成纯函数这些分支才能被
 * 单测穷举，混进 I/O 后同样的覆盖就只能靠跑设备。
 *
 * 只认三种行：`#EXTINF:` 行、地址行、其余注释行。`#EXTGRP` / `#EXTALB` / `#PLAYLIST`
 * 等扩展标签一律当注释忽略（proposal 非目标）。
 */

/** 解析出的一条曲目。地址已按基准地址解析为绝对 http/https 地址。 */
export type PlaylistEntry = {
  url: URL;
  title: string;
  artist: string | null;
  durationMs: number | null;
};

/** `kind: 'hls'` 是 HLS 媒体播放列表：整体拒绝，不返回任何条目（决策 5）。 */
export type PlaylistParseResult =
  | { kind: 'hls' }
  | { kind: 'playlist'; entries: PlaylistEntry[]; skipped: SkippedEntry[] };

/** UTF-8 解码失败时留下的替换字符。带上它的文本一律不写进曲目记录（决策 4）。 */
const REPLACEMENT = '�';

/**
 * 解析播放列表文本。
 *
 * @param base 播放列表自身的位置，相对地址以它为基准（决策 3）。拿不到时传 null，
 *   此时相对地址无法解析，按不可用条目处理。
 */
export function parsePlaylist(text: string, base: URL | null): PlaylistParseResult {
  const lines = text.split(/\r\n|\r|\n/);

  // HLS 判定先于一切：`.m3u8` 这个扩展名同时被普通播放列表和 HLS 媒体播放列表使用，
  // 而 HLS 里的地址是同一条流的时间分片而非一首首曲目。两者不会混在同一个文件里，
  // 判定不存在中间态，因此是整体拒绝而不是跳过可疑行（决策 5）。
  if (lines.some((line) => line.trimStart().startsWith('#EXT-X-'))) return { kind: 'hls' };

  const entries: PlaylistEntry[] = [];
  const skipped: SkippedEntry[] = [];
  let pending: ExtInf | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      // `#EXTINF` 之外的注释行不产生条目，也不清掉已读到的元数据——真实文件里
      // `#EXTINF` 与地址之间偶尔夹着别的扩展标签。
      if (/^#EXTINF\s*:/i.test(line)) pending = parseExtInf(line);
      continue;
    }

    const resolved = resolveEntryUrl(line, base);
    if ('reason' in resolved) {
      skipped.push({ line, reason: resolved.reason });
    } else {
      entries.push({
        // 元数据缺失或解码不出来时回退为从地址推断，条目本身照常保留：
        // 地址是 ASCII 或百分号编码，编码问题最坏只波及元数据，不该波及能不能播。
        title: pending?.title ?? inferTitleFromUrl(resolved.url),
        artist: pending?.artist ?? null,
        durationMs: pending?.durationMs ?? null,
        url: resolved.url,
      });
    }
    pending = null;
  }

  return { kind: 'playlist', entries, skipped };
}

/**
 * 字节 → 文本。
 *
 * UTF-8 优先；失败时试一次中文本地编码；再失败就交出带替换字符的文本，由
 * `parsePlaylist` 丢掉那些条目的标题与艺人（决策 4）。不引入编码探测库——
 * 回退路径已经保证最坏情况是「可用但少元数据」，不是「不可用」。
 */
export function decodePlaylistBytes(bytes: Uint8Array): string {
  // UTF-8 BOM 不是内容。留着它第一行会变成 `﻿#EXTM3U`，HLS 判定与注释判定都会落空。
  const body =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? bytes.subarray(3)
      : bytes;

  const utf8 = decodeStrict('utf-8', body);
  if (utf8 !== null) return utf8;

  // 中文 Windows 播放器导出的 .m3u 常为本地编码。gb18030 是 GBK 的超集，也是
  // WHATWG 给这一族编码定的标签。运行时不一定带这张表（Hermes 只保证 UTF-8），
  // 不支持时 TextDecoder 构造即抛，由 decodeStrict 吞掉转入下面的有损路径。
  const gb = decodeStrict('gb18030', body);
  if (gb !== null) return gb;

  return new TextDecoder('utf-8').decode(body);
}

function decodeStrict(label: string, bytes: Uint8Array): string | null {
  try {
    return new TextDecoder(label, { fatal: true }).decode(bytes);
  } catch {
    // 标签不受支持与字节不合法都落到这里，对调用方是同一件事：这条路走不通。
    return null;
  }
}

type ExtInf = { title: string | null; artist: string | null; durationMs: number | null };

/** `#EXTINF:<秒数>,<艺人> - <标题>`。秒数后可能跟着扩展属性，描述里可能没有艺人分隔。 */
function parseExtInf(line: string): ExtInf {
  const body = line.slice(line.indexOf(':') + 1);
  const comma = body.indexOf(',');
  const durationMs = parseDuration(comma >= 0 ? body.slice(0, comma) : body);
  const description = comma >= 0 ? body.slice(comma + 1).trim() : '';

  // 解码不出来的描述整条丢弃。缺标题时用户看到的是从地址推断出的可读文本，
  // 而乱码是一行没法检索、没法辨认、还会永久留在曲库里的垃圾（决策 4）。
  if (!description || description.includes(REPLACEMENT)) {
    return { title: null, artist: null, durationMs };
  }

  const separator = description.indexOf(' - ');
  if (separator < 0) return { title: description, artist: null, durationMs };

  const artist = description.slice(0, separator).trim();
  const title = description.slice(separator + 3).trim();
  // 分隔符两侧只要有一侧是空的，就说明它是标题自身的一部分而不是分隔
  if (!artist || !title) return { title: description, artist: null, durationMs };
  return { title, artist, durationMs };
}

function parseDuration(raw: string): number | null {
  // 秒数后面可能跟着 `tvg-id="…"` 之类的属性，只取开头的数字。
  const seconds = Number.parseFloat(raw.trim());
  // `-1` 是「时长未知」的约定写法；非数字同样当未知。
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.round(seconds * 1000);
}

type ResolvedEntry = { url: URL } | { reason: string };

function resolveEntryUrl(line: string, base: URL | null): ResolvedEntry {
  let url: URL;
  try {
    url = base ? new URL(line, base) : new URL(line);
  } catch {
    return { reason: '不是有效的地址' };
  }

  if (url.protocol === 'http:' || url.protocol === 'https:') return { url };

  // 本地播放列表里的相对路径会落到这里。不把它拼成一条本地文件曲目：本地文件来源
  // 要的是系统发放的持久授权 URI，从一行文本拼不出来，硬拼出的记录重启后必然点不响
  // （决策 3）。
  if (url.protocol === 'file:' || url.protocol === 'content:') {
    return { reason: '指向设备上的文件，请改用「从设备选择音频文件」加入曲库' };
  }
  return { reason: `不支持的协议 ${url.protocol.replace(':', '')}` };
}
