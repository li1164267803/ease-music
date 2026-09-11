// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

/**
 * 播放列表解析的单测（add-m3u-import/design.md 决策 2）。
 *
 * 解析器被刻意做成不碰网络、不碰存储的纯函数，就是为了让编码、相对地址、畸形行
 * 这三类真正容易错的分支能在这里被穷举，而不是靠跑设备一个个试。
 *
 * 用法：pnpm test:m3u
 */

/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';

import { decodePlaylistBytes, parsePlaylist, type PlaylistEntry } from '@/library/m3u';

const BASE = new URL('https://example.com/music/list.m3u');

function playlist(text: string, base: URL | null = BASE) {
  const result = parsePlaylist(text, base);
  assert.equal(result.kind, 'playlist');
  // 上一行已收窄，这里只是让后续访问有类型
  if (result.kind !== 'playlist') throw new Error('unreachable');
  return result;
}

function only(text: string, base: URL | null = BASE): PlaylistEntry {
  const { entries } = playlist(text, base);
  assert.equal(entries.length, 1);
  return entries[0]!;
}

test('带 #EXTINF 的条目取出时长、艺人与标题', () => {
  const entry = only('#EXTM3U\n#EXTINF:217,周杰伦 - 晴天\nhttps://example.com/a.mp3\n');
  assert.equal(entry.title, '晴天');
  assert.equal(entry.artist, '周杰伦');
  assert.equal(entry.durationMs, 217_000);
  assert.equal(entry.url.toString(), 'https://example.com/a.mp3');
});

test('没有 #EXTINF 的地址行照常成为条目，标题从地址末段推断', () => {
  const entry = only('https://example.com/songs/%E6%99%B4%E5%A4%A9.mp3');
  assert.equal(entry.title, '晴天');
  assert.equal(entry.artist, null);
  assert.equal(entry.durationMs, null);
});

test('时长 -1 视为未知，条目本身保留', () => {
  const entry = only('#EXTINF:-1,晴天\nhttps://example.com/a.mp3');
  assert.equal(entry.durationMs, null);
  assert.equal(entry.title, '晴天');
});

test('时长不是数字时视为未知', () => {
  assert.equal(only('#EXTINF:abc,晴天\nhttps://example.com/a.mp3').durationMs, null);
});

test('秒数后带扩展属性时仍能取出时长', () => {
  const entry = only('#EXTINF:217 tvg-id="x",周杰伦 - 晴天\nhttps://example.com/a.mp3');
  assert.equal(entry.durationMs, 217_000);
  assert.equal(entry.artist, '周杰伦');
});

test('描述不含艺人分隔时整体作为标题', () => {
  const entry = only('#EXTINF:217,晴天\nhttps://example.com/a.mp3');
  assert.equal(entry.title, '晴天');
  assert.equal(entry.artist, null);
});

test('分隔符一侧为空时不拆，整体作为标题', () => {
  assert.equal(only('#EXTINF:217, - 晴天\nhttps://example.com/a.mp3').title, '- 晴天');
});

test('相对地址以播放列表位置为基准', () => {
  assert.equal(only('songs/a.mp3').url.toString(), 'https://example.com/music/songs/a.mp3');
  assert.equal(only('../top/b.mp3').url.toString(), 'https://example.com/top/b.mp3');
  assert.equal(only('/root/c.mp3').url.toString(), 'https://example.com/root/c.mp3');
});

test('没有基准地址时相对地址无法解析，计入跳过项', () => {
  const { entries, skipped } = playlist('songs/a.mp3', null);
  assert.equal(entries.length, 0);
  assert.deepEqual(skipped, [{ line: 'songs/a.mp3', reason: '不是有效的地址' }]);
});

test('本地播放列表里的相对路径按不可用条目处理，并指向本地文件导入', () => {
  const { entries, skipped } = playlist('a.mp3\n', new URL('file:///storage/music/list.m3u'));
  assert.equal(entries.length, 0);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0]!.reason, /从设备选择音频文件/);
});

test('非 http/https 协议计入跳过项并带上原因，其余条目照常入库', () => {
  const { entries, skipped } = playlist(
    ['#EXTM3U', 'rtsp://example.com/live', 'https://example.com/a.mp3'].join('\n'),
  );
  assert.equal(entries.length, 1);
  assert.deepEqual(skipped, [{ line: 'rtsp://example.com/live', reason: '不支持的协议 rtsp' }]);
});

test('畸形行计入跳过项', () => {
  const { entries, skipped } = playlist('http://\nhttps://example.com/a.mp3', null);
  assert.equal(entries.length, 1);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0]!.reason, '不是有效的地址');
});

test('空行与非 #EXTINF 的注释行被忽略，顺序保持不变', () => {
  const { entries, skipped } = playlist(
    [
      '#EXTM3U',
      '#PLAYLIST:我的歌单',
      '',
      '#EXTINF:1,A',
      '#EXTGRP:组',
      'https://example.com/1.mp3',
      '   ',
      '#EXTINF:2,B',
      'https://example.com/2.mp3',
      '# 随手写的注释',
      'https://example.com/3.mp3',
    ].join('\n'),
  );
  assert.equal(skipped.length, 0);
  assert.deepEqual(
    entries.map((entry) => entry.title),
    ['A', 'B', '3'],
  );
});

test('元数据只作用于紧随其后的一个条目', () => {
  const { entries } = playlist('#EXTINF:1,A\nhttps://example.com/1.mp3\nhttps://example.com/2.mp3');
  assert.equal(entries[0]!.title, 'A');
  assert.equal(entries[1]!.title, '2');
  assert.equal(entries[1]!.durationMs, null);
});

test('出现 #EXT-X- 标签即整体判为 HLS，不返回任何条目', () => {
  const hls = [
    '#EXTM3U',
    '#EXT-X-TARGETDURATION:10',
    '#EXTINF:9.009,',
    'seg0.ts',
    '#EXTINF:9.009,',
    'seg1.ts',
  ].join('\n');
  assert.deepEqual(parsePlaylist(hls, BASE), { kind: 'hls' });
});

test('主播放列表（#EXT-X-STREAM-INF）同样整体拒绝', () => {
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\nhigh.m3u8';
  assert.deepEqual(parsePlaylist(master, BASE), { kind: 'hls' });
});

test('空文件解析出零条目零跳过', () => {
  assert.deepEqual(playlist(''), { kind: 'playlist', entries: [], skipped: [] });
  assert.deepEqual(playlist('#EXTM3U\n\n'), { kind: 'playlist', entries: [], skipped: [] });
});

test('不是播放列表的文本解析不出条目', () => {
  const { entries, skipped } = playlist('这是一篇随手记\n第二行也不是地址', null);
  assert.equal(entries.length, 0);
  assert.equal(skipped.length, 2);
});

test('CRLF 与 CR 换行都能切分', () => {
  assert.equal(
    playlist('https://example.com/1.mp3\r\nhttps://example.com/2.mp3').entries.length,
    2,
  );
  assert.equal(playlist('https://example.com/1.mp3\rhttps://example.com/2.mp3').entries.length, 2);
});

test('UTF-8 带 BOM：BOM 被跳过，第一行仍是 #EXTM3U', () => {
  const bytes = new Uint8Array([
    0xef,
    0xbb,
    0xbf,
    ...new TextEncoder().encode('#EXTM3U\n#EXTINF:1,周杰伦 - 晴天\nhttps://example.com/a.mp3'),
  ]);
  const entry = only(decodePlaylistBytes(bytes));
  assert.equal(entry.title, '晴天');
  assert.equal(entry.artist, '周杰伦');
});

test('非 UTF-8 的中文播放列表：还原出中文，或退化为地址推断，绝不写入乱码', () => {
  // GBK 的「周杰伦 - 晴天」。运行时不一定带这张表，两种结果都合格，乱码不合格。
  const gbk = new Uint8Array([
    0x23,
    0x45,
    0x58,
    0x54,
    0x49,
    0x4e,
    0x46,
    0x3a,
    0x31,
    0x2c, // #EXTINF:1,
    0xd6,
    0xdc,
    0xbd,
    0xdc,
    0xc2,
    0xd7, // 周杰伦
    0x20,
    0x2d,
    0x20, // " - "
    0xc7,
    0xe7,
    0xcc,
    0xec, // 晴天
    0x0a,
    ...new TextEncoder().encode('https://example.com/songs/rain.mp3'),
  ]);
  const entry = only(decodePlaylistBytes(gbk));
  assert.ok(!entry.title.includes('�'), '标题不得含替换字符');
  assert.ok(!(entry.artist ?? '').includes('�'), '艺人不得含替换字符');
  assert.ok(
    (entry.title === '晴天' && entry.artist === '周杰伦') ||
      (entry.title === 'rain' && entry.artist === null),
    `既没还原出中文也没退化为地址推断：${entry.artist} - ${entry.title}`,
  );
});

test('解码失败留下的替换字符不写进曲目，标题回退为地址推断', () => {
  const entry = only('#EXTINF:1,�� - ��\nhttps://example.com/songs/rain.mp3');
  assert.equal(entry.title, 'rain');
  assert.equal(entry.artist, null);
  assert.equal(entry.durationMs, 1000);
});

test('纯 ASCII 与 UTF-8 中文都按 UTF-8 解出', () => {
  assert.equal(decodePlaylistBytes(new TextEncoder().encode('晴天')), '晴天');
  assert.equal(decodePlaylistBytes(new Uint8Array(0)), '');
});
