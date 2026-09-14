// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useSyncExternalStore } from 'react';

import { downloadTrackAudio, isTrackCacheable } from '@/cache/download';
import { deleteCacheFile } from '@/cache/files';
import {
  getTrackCacheState,
  removeAllCacheEntries,
  removeCacheEntry,
  saveCacheEntry,
  setTrackCacheState,
} from '@/cache/store';
import type { Track } from '@/domain/model/track';
import { notifyLibraryChanged } from '@/library/store';

/**
 * 下载队列。
 *
 * **并发度固定为 1**（design.md 决策 6）：移动网络下多路并发抢同一条链路，总耗时并不
 * 改善；而插件来源指向的站点对并发敏感，批量并发容易触发限流甚至封禁，代价由用户承担。
 */
type QueueTask = {
  track: Track;
  /** 每个任务持有自己的取消器：取消一首不影响其余，移除曲目时也能精确取消 */
  controller: AbortController;
};

const waiting: QueueTask[] = [];
let running: QueueTask | null = null;

/**
 * 「本轮」的结果：从队列由空转为非空，到再次排空之间。
 *
 * 批量下载完成后要告诉用户成功了几首、哪几首失败（spec 的批量下载要求），
 * 而队列排空之后这份结果必须还在——否则用户什么也看不到。下一次入队时重置。
 */
let round: { completedIds: string[]; failed: DownloadFailure[] } = { completedIds: [], failed: [] };

/** 失败要连**原因**一起带出来：spec 要求说明原因，只报一个标题等于没说。 */
export type DownloadFailure = { trackId: string; title: string; reason: string };

/**
 * 队列是全局的，结果却要按「这批曲目」读（fix-android-acceptance-ui-issues/design.md 决策 3）：
 * 每一项都带曲目 id，读取方用自己关心的曲目集合去求交，而不是原样展示全局计数。
 */
export type DownloadQueueSnapshot = {
  /** 等待中 + 下载中 */
  pendingIds: readonly string[];
  completedIds: readonly string[];
  failed: readonly DownloadFailure[];
};

let snapshot: DownloadQueueSnapshot = { pendingIds: [], completedIds: [], failed: [] };
const listeners = new Set<() => void>();

/**
 * 只在队列**组成**变化时广播，不跟随下载进度。
 *
 * 进度每几百毫秒变一次，它属于单首曲目的状态，由 `store.ts` 按 id 精确通知；
 * 若在这里也广播，一次下载就会把整个列表反复重渲染一遍。
 */
function publish(): void {
  snapshot = {
    pendingIds: [...waiting, ...(running ? [running] : [])].map((task) => task.track.id),
    completedIds: [...round.completedIds],
    failed: [...round.failed],
  };
  listeners.forEach((listener) => listener());
}

export function useDownloadQueue(): DownloadQueueSnapshot {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => snapshot,
  );
}

/**
 * 把曲目送进下载队列，返回真正入队的数量。
 *
 * 跳过三类曲目：已下载的（spec：重复下载不产生第二份）、已在队列里的、
 * 来源声明不可缓存的（本地文件的音频本就在设备上，再复制一份纯属浪费）。
 */
export function enqueueDownloads(tracks: readonly Track[]): number {
  if (waiting.length === 0 && running === null) round = { completedIds: [], failed: [] };

  let added = 0;
  for (const track of tracks) {
    if (!isTrackCacheable(track)) continue;

    const status = getTrackCacheState(track.id).status;
    if (status === 'downloaded' || status === 'queued' || status === 'downloading') continue;

    waiting.push({ track, controller: new AbortController() });
    setTrackCacheState(track.id, { status: 'queued' });
    added += 1;
  }

  publish();
  void pump();
  return added;
}

async function pump(): Promise<void> {
  if (running) return;

  const task = waiting.shift();
  if (!task) return;

  running = task;
  setTrackCacheState(task.track.id, { status: 'downloading', bytesWritten: 0, totalBytes: -1 });
  publish();

  try {
    const record = await downloadTrackAudio(
      task.track,
      task.controller.signal,
      (bytesWritten, totalBytes) =>
        setTrackCacheState(task.track.id, { status: 'downloading', bytesWritten, totalBytes }),
    );

    // 下载完成与写库之间还有一个窗口，取消可能恰好落在这里——用户此刻删掉了缓存，
    // 或干脆把曲目移出了曲库。这时写记录会把刚删掉的东西写回来，或撞上外键
    // （曲目行已经没了），因此直接丢弃这次结果。
    if (task.controller.signal.aborted) {
      deleteCacheFile(record.fileUri);
      setTrackCacheState(task.track.id, null);
      return;
    }

    await saveCacheEntry(record);
    round.completedIds.push(task.track.id);
    // 已下载分类与占用统计都是数据库的视图，让它们跟着重查一次。
    notifyLibraryChanged();
  } catch (error) {
    if (task.controller.signal.aborted) {
      // 用户主动取消不是失败，不进入本轮的失败列表，也不留下失败状态。
      setTrackCacheState(task.track.id, null);
    } else {
      const reason = error instanceof Error ? error.message : '下载失败。';
      setTrackCacheState(task.track.id, { status: 'failed', reason });
      // 单首失败不中断其余曲目——spec 的批量下载要求。
      round.failed.push({ trackId: task.track.id, title: task.track.title, reason });
    }
  } finally {
    running = null;
    publish();
    void pump();
  }
}

export function cancelDownload(trackId: string): void {
  if (running?.track.id === trackId) {
    running.controller.abort();
    return;
  }

  const index = waiting.findIndex((task) => task.track.id === trackId);
  if (index < 0) return;

  waiting.splice(index, 1);
  setTrackCacheState(trackId, null);
  publish();
}

export function cancelAllDownloads(): void {
  for (const task of waiting) setTrackCacheState(task.track.id, null);
  waiting.length = 0;
  running?.controller.abort();
  publish();
}

/**
 * 删除一首曲目的缓存。先取消可能正在进行的下载，否则它完成后会把刚删掉的记录写回来。
 */
export async function deleteDownload(trackId: string): Promise<void> {
  cancelDownload(trackId);
  await removeCacheEntry(trackId);
  notifyLibraryChanged();
}

export async function deleteAllDownloads(): Promise<void> {
  cancelAllDownloads();
  await removeAllCacheEntries();
  notifyLibraryChanged();
}
