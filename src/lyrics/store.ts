// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useEffect, useState, useSyncExternalStore } from 'react';

import { loadLyricsDirectory, saveLyricsDirectory } from '@/domain/settings';
import type { Track } from '@/domain/model/track';
import { pickDirectory } from '@/lyrics/directory';
import { parseLrc } from '@/lyrics/lrc';
import type { LyricsLookup } from '@/lyrics/model';
import { deleteAllCachedLyrics, getCachedLyrics, saveCachedLyrics } from '@/lyrics/repository';
import { fetchLyrics } from '@/lyrics/sources';

/**
 * 歌词的取用入口与订阅。
 *
 * 读取路径只有一条：缓存命中即刻返回，未命中才去四处来源找，找到就写回缓存
 * （design.md 决策 4）。播放层对此一无所知——歌词组件自己订阅播放状态、自己来这里
 * 取词（决策 7）。
 */
export type LyricsState = { status: 'loading' } | LyricsLookup;

const LOADING: LyricsState = { status: 'loading' };

/**
 * 本进程内每首曲目的查找结果。
 *
 * 与数据库缓存的分工：数据库只存**找到了**的歌词；「没找到」不落库，否则用户装上
 * 歌词插件后旧曲目永远不会再找。但同一次运行里反复播放一首没词的歌也不该每次都
 * 把四处来源再跑一遍（插件那两处是真实的网络请求），所以进程内记住结果。
 * 以 Promise 为值，同时起到合并并发请求的作用：播放页与迷你播放器同时问同一首时
 * 只查一次。
 */
const lookups = new Map<string, Promise<LyricsLookup>>();

function lookup(track: Track): Promise<LyricsLookup> {
  const existing = lookups.get(track.id);
  if (existing) return existing;

  const pending = resolve(track)
    .then((result) => {
      // 「目录里有文件但读不出」不记进本进程的结果：用户把文件另存为 UTF-8 后再打开
      // 播放页就该看到，重查的代价只是列一次目录、读一个几 KB 的文件。
      if (result.status === 'not-found' && result.unreadableFile) lookups.delete(track.id);
      return result;
    })
    .catch((error: unknown): LyricsLookup => {
      // 到这里的只可能是缓存读写失败。歌词取不到就是取不到，不能让播放页因此出错。
      console.warn('[lyrics] 查找失败:', error instanceof Error ? error.message : error);
      lookups.delete(track.id);
      return { status: 'not-found', unreadableFile: null };
    });
  lookups.set(track.id, pending);
  return pending;
}

async function resolve(track: Track): Promise<LyricsLookup> {
  const cached = await getCachedLyrics(track.id);
  if (cached) return { status: 'found', lyrics: parseLrc(cached.content), source: cached.source };

  const outcome = await fetchLyrics(track);
  if (outcome.status === 'unreadable') {
    return { status: 'not-found', unreadableFile: outcome.fileName };
  }
  if (outcome.status === 'not-found') return { status: 'not-found', unreadableFile: null };

  await saveCachedLyrics(track.id, outcome.found);
  return { status: 'found', lyrics: parseLrc(outcome.found.content), source: outcome.found.source };
}

/** 当前曲目的歌词。曲目为 null（未在播放）时恒为「没找到」，界面据此不渲染歌词区。 */
export function useLyrics(track: Track | null): LyricsState {
  // 歌词目录变了要重新找：目录是最高优先级的来源，改完回到播放页应当立刻看到结果。
  const revision = useDirectoryRevision();
  // 结果与「哪首曲目、哪一版目录」绑定：换歌或换目录后旧结果自动失效、回到加载中，
  // 不需要在 effect 里先把状态清一遍（与播放页拖动位置的处理同一思路）。
  const [result, setResult] = useState<{
    trackId: string;
    revision: number;
    lookup: LyricsLookup;
  } | null>(null);

  useEffect(() => {
    if (!track) return;

    let current = true;
    void lookup(track).then((lookupResult) => {
      if (current) setResult({ trackId: track.id, revision, lookup: lookupResult });
    });
    return () => {
      current = false;
    };
    // 结果只由曲目身份决定；曲目对象的其他字段变化（如失效标记）不需要重新查找。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, revision]);

  if (!track) return { status: 'not-found', unreadableFile: null };
  return result && result.trackId === track.id && result.revision === revision
    ? result.lookup
    : LOADING;
}

/*
 * 歌词目录的设置。与曲目无关的一个全局值，改动的入口只有本文件的两个函数，
 * 因此用一个窄播即可让「我的」页跟上。
 */
let directoryRevision = 0;
const directoryListeners = new Set<() => void>();

function notifyDirectoryChanged(): void {
  directoryRevision += 1;
  directoryListeners.forEach((listener) => listener());
}

function subscribeDirectory(listener: () => void): () => void {
  directoryListeners.add(listener);
  return () => directoryListeners.delete(listener);
}

function useDirectoryRevision(): number {
  return useSyncExternalStore(
    subscribeDirectory,
    () => directoryRevision,
    () => directoryRevision,
  );
}

/** 当前歌词目录的 URI，未指定时为 null。 */
export function useLyricsDirectory(): string | null {
  const revision = useDirectoryRevision();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void loadLyricsDirectory().then((result) => {
      if (current) setUri(result);
    });
    return () => {
      current = false;
    };
  }, [revision]);

  return uri;
}

/** 弹目录选择器并保存。用户取消时什么都不改。 */
export async function chooseLyricsDirectory(): Promise<void> {
  const uri = await pickDirectory();
  if (uri) await applyLyricsDirectory(uri);
}

export async function clearLyricsDirectory(): Promise<void> {
  await applyLyricsDirectory(null);
}

/**
 * 目录变更后清空全部歌词缓存。
 *
 * 目录是四处来源里优先级最高的一处，用户换了目录就是在说「按新目录重新找」；
 * 已缓存的其他来源的歌词若不清，新目录里的文件永远盖不过它们。代价是插件来源的
 * 歌词会在下次播放时各重取一次——这是用户主动改设置换来的，不是自动发生的。
 */
async function applyLyricsDirectory(uri: string | null): Promise<void> {
  await saveLyricsDirectory(uri);
  await deleteAllCachedLyrics();
  lookups.clear();
  notifyDirectoryChanged();
}
