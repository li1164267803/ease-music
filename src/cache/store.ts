// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useCallback, useSyncExternalStore } from 'react';

import {
  cachedFileExists,
  clearPartialFiles,
  deleteCacheFile,
  pruneCacheFiles,
} from '@/cache/files';
import {
  deleteAllCacheRecords,
  deleteCacheRecord,
  getCacheRecord,
  listCacheRecords,
  saveCacheRecord,
  type TrackCacheRecord,
} from '@/cache/repository';

/**
 * 缓存层的内存状态。
 *
 * **本模块刻意不引用 `src/sources`**。来源层的 `resolve.ts` 要在这里查缓存命中
 * （design.md 决策 4），若本模块反过来依赖来源层，分层就成了环。需要来源的只有
 * 「下载执行」（`download.ts`）与「队列」（`queue.ts`），它们在来源层之上。
 *
 * 进行中的状态只存在这里、不落库（决策 7）：进程被杀就是下载中断，spec 要求重启后
 * 该曲目不得显示为已下载。状态本就随进程生灭，落库反而要在每次启动时清一遍。
 */
export type TrackCacheState =
  | { status: 'idle' }
  | { status: 'queued' }
  /** `totalBytes` 为 -1 表示服务端没给 `Content-Length`，此时只能报已下载的字节数 */
  | { status: 'downloading'; bytesWritten: number; totalBytes: number }
  | { status: 'downloaded'; bytes: number }
  | { status: 'failed'; reason: string };

const IDLE: TrackCacheState = { status: 'idle' };

const states = new Map<string, TrackCacheState>();

/**
 * 按曲目分组的订阅，而不是一个全局广播。
 *
 * 下载进度每几百毫秒变一次；若沿用曲库那种「变了就通知所有人」的广播，一次下载会让
 * 整个歌单列表反复重渲染。曲目状态天然是按 id 隔离的，订阅也就按 id 隔离。
 */
const listeners = new Map<string, Set<() => void>>();

export function getTrackCacheState(trackId: string): TrackCacheState {
  return states.get(trackId) ?? IDLE;
}

/** 传 `null` 表示回到「未下载」。 */
export function setTrackCacheState(trackId: string, state: TrackCacheState | null): void {
  if (state) states.set(trackId, state);
  else states.delete(trackId);

  listeners.get(trackId)?.forEach((listener) => listener());
}

function subscribeTrack(trackId: string, listener: () => void): () => void {
  const existing = listeners.get(trackId) ?? new Set<() => void>();
  existing.add(listener);
  listeners.set(trackId, existing);

  return () => {
    existing.delete(listener);
    if (existing.size === 0) listeners.delete(trackId);
  };
}

export function useTrackCacheState(trackId: string): TrackCacheState {
  const subscribe = useCallback(
    (listener: () => void) => subscribeTrack(trackId, listener),
    [trackId],
  );
  const snapshot = useCallback(() => getTrackCacheState(trackId), [trackId]);

  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * 应用启动时的缓存初始化：清残留、纠正孤儿、把已完成的记录读进内存。
 *
 * 三种不一致里的两种在这里被纠正（决策 8）：`.partial` 残留整个清空，
 * 「文件有、记录无」的孤儿按记录集合清掉。第三种「记录有、文件无」不在这里处理——
 * 它在播放解析时懒纠正，见 `resolveCachedFileUri`。
 */
export async function initTrackCache(): Promise<void> {
  clearPartialFiles();

  const records = await listCacheRecords();
  for (const record of records) {
    setTrackCacheState(record.trackId, { status: 'downloaded', bytes: record.bytes });
  }

  pruneCacheFiles(new Set(records.map((record) => record.fileUri)));
}

/**
 * 缓存命中判定，供来源层的唯一解析入口调用。
 *
 * 返回 null 表示没有可用缓存，调用方继续走来源解析。记录在、文件已经不在时
 * （用户清了应用数据、文件被外部删除）删掉记录并把状态改回未下载，**不报错**——
 * spec 要求这种情况回退到来源解析，而不是让播放失败。
 */
export async function resolveCachedFileUri(trackId: string): Promise<string | null> {
  const record = await getCacheRecord(trackId);
  if (!record) return null;

  if (cachedFileExists(record.fileUri)) return record.fileUri;

  await deleteCacheRecord(trackId);
  setTrackCacheState(trackId, null);
  return null;
}

/** 记下一次完成的下载。顺序由调用方保证：文件先就位，记录后写（决策 3）。 */
export async function saveCacheEntry(record: TrackCacheRecord): Promise<void> {
  await saveCacheRecord(record);
  setTrackCacheState(record.trackId, { status: 'downloaded', bytes: record.bytes });
}

/**
 * 删除一首曲目的缓存：文件、记录、内存状态。
 *
 * 只动应用自己下载的那份音频。曲目记录、元数据、封面、歌单归属都不受影响——
 * offline-cache spec 对「清理缓存」的明确要求。
 */
export async function removeCacheEntry(trackId: string): Promise<void> {
  const record = await getCacheRecord(trackId);
  if (record) {
    deleteCacheFile(record.fileUri);
    await deleteCacheRecord(trackId);
  }
  setTrackCacheState(trackId, null);
}

export async function removeAllCacheEntries(): Promise<void> {
  const records = await listCacheRecords();
  for (const record of records) deleteCacheFile(record.fileUri);

  await deleteAllCacheRecords();
  for (const record of records) setTrackCacheState(record.trackId, null);
}
