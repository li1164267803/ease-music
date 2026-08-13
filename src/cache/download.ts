// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { File } from 'expo-file-system';

import { cacheFileFor, inferExtension, partialFileFor } from '@/cache/files';
import type { TrackCacheRecord } from '@/cache/repository';
import type { Track } from '@/domain/model/track';
import { parseAudioMetadata } from '@/library/metadata';
import { MediaResolutionError } from '@/sources/contract';
import { getSource } from '@/sources/registry';

/**
 * 单曲下载的执行。
 *
 * 这里是缓存层唯一认识来源层的地方，也因此它位于来源层**之上**：
 * 状态与记录（`store.ts`、`repository.ts`）不引用来源，来源层的解析入口才能反过来
 * 依赖它们而不成环。
 */

/**
 * 该曲目能否被下载（design.md 决策 9）。
 *
 * 由来源自述而不是在这里判断 `sourceId === 'local-file'`——缓存层一旦认识某个具体来源，
 * C5 网盘或任何自带本地形态的来源接进来时都要再改一次，那正是 media-source spec
 * 要防止的改动。来源不在注册表里（插件已卸载）时也不可下载：连地址都解析不出来。
 */
export function isTrackCacheable(track: Track): boolean {
  const source = getSource(track.sourceId);
  return source !== undefined && source.cacheable !== false;
}

export type DownloadProgressHandler = (bytesWritten: number, totalBytes: number) => void;

/**
 * 把一首曲目的音频下载到本地，返回待写入的缓存记录。
 *
 * 地址在**轮到执行时**才解析，不在入队时解析：插件与网盘给的常是短时效链接，
 * 排队等待期间就会过期。解析走 `getSource(...).resolve(...)` 而不是 `resolveTrack`
 * ——后者命中缓存时返回的是本地路径，下载器要的是来源的真实地址（决策 5）。
 *
 * 落盘顺序：`.partial/<id>` → 成功后 `moveSync` 到最终路径 → 由调用方写库。
 * 顺序不可交换，理由见 design.md 决策 3。
 */
export async function downloadTrackAudio(
  track: Track,
  signal: AbortSignal,
  onProgress: DownloadProgressHandler,
): Promise<TrackCacheRecord> {
  try {
    const source = getSource(track.sourceId);
    if (!source) {
      throw new MediaResolutionError(
        'source-not-registered',
        `曲目来源「${track.sourceId}」不可用，无法下载。`,
      );
    }

    const media = await source.resolve(track);

    const partial = partialFileFor(track.id);
    if (partial.exists) partial.delete();

    const task = File.createDownloadTask(media.uri, partial, {
      // 防盗链要求下载请求与播放请求带同样的头。契约把 UA 单列一项，
      // 而下载任务只认 headers——与播放层的处理保持一致，合并成一个 header。
      headers: media.userAgent
        ? { ...media.headers, 'User-Agent': media.userAgent }
        : media.headers,
      onProgress: ({ bytesWritten, totalBytes }) => onProgress(bytesWritten, totalBytes),
      signal,
    });

    await task.downloadAsync();
    if (!partial.exists || partial.size <= 0) {
      throw new Error('下载没有得到任何内容，地址可能已失效。');
    }

    const destination = cacheFileFor(track.id, inferExtension(media.uri, partial));
    // 重新下载同一首时目标可能已存在（旧的一份或扩展名不同的一份），先让位。
    if (destination.exists) destination.delete();
    partial.moveSync(destination);

    return {
      trackId: track.id,
      fileUri: destination.uri,
      bytes: destination.size,
      durationMs: await readCachedDuration(destination.uri),
      completedAt: Date.now(),
    };
  } catch (error) {
    // 失败或被取消时清掉临时文件。移动成功之后这个路径上已经没有文件，
    // 因此这段清理不会误删刚落位的缓存。
    const leftover = partialFileFor(track.id);
    if (leftover.exists) leftover.delete();
    throw describeFailure(error);
  }
}

/**
 * 读出下载到的音频**实际**有多长。
 *
 * 复用曲库的元数据解析而不是另写一份：它已经处理过「无 Xing 头的 CBR MP3 会被算成所读
 * 那一段的长度」这个坑（见 `parseAudioMetadata` 的两段式读取），在这里同样会踩到。
 * 这是能力层内部的横向依赖，理由就是这个——不该为了分层洁癖复制一份解析逻辑出来。
 *
 * 解析失败返回 null，**绝不让下载失败**：文件已经完整落盘了，读不出时长只是少一项
 * 展示信息，把整次下载判负是本末倒置。
 */
async function readCachedDuration(uri: string): Promise<number | null> {
  try {
    return (await parseAudioMetadata(uri))?.durationMs ?? null;
  } catch {
    return null;
  }
}

/**
 * 把底层故障转成面向用户的中文说明。
 *
 * offline-cache spec 要求下载失败时说明原因而不是静默失败，而底层抛出来的是
 * `HTTP 403`、`ENOSPC` 这类英文技术信息，直接摆给用户等于没说。
 */
function describeFailure(error: unknown): Error {
  // 来源解析失败自带中文说明（各来源实现已经写好），原样透出即可。
  if (error instanceof MediaResolutionError) return new Error(error.message);

  const message = error instanceof Error ? error.message : String(error);

  const status = /(?:HTTP|status)\D*(\d{3})/i.exec(message)?.[1];
  if (status) return new Error(`服务器拒绝了下载请求（HTTP ${status}），该地址可能已失效。`);

  if (/no space|enospc|not enough space/i.test(message)) {
    return new Error('设备存储空间不足，下载未能完成。');
  }
  if (
    /network|timeout|timed out|unable to resolve host|connection|socket|ssl|unreachable/i.test(
      message,
    )
  ) {
    return new Error('网络连接中断，下载未能完成。');
  }
  return new Error(`下载失败：${message}`);
}
