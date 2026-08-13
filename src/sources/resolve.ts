// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { resolveCachedFileUri } from '@/cache/store';
import type { Track } from '@/domain/model/track';
import { MediaResolutionError, type ResolvedMedia } from '@/sources/contract';
import { getSource } from '@/sources/registry';

/**
 * 播放前地址解析的**唯一入口**。
 *
 * bootstrap-music-player/design.md 决策 4 要求这个入口唯一且可拦截，
 * add-offline-cache 兑现了它：命中本地缓存则返回缓存路径，否则走来源解析。
 * 播放层与各来源实现都不需要知道缓存的存在，因此播放层不得绕过本函数直接
 * 调用 `getSource(...).resolve(...)`。
 *
 * 抛出的异常统一为 `MediaResolutionError`，携带面向用户的中文原因——media-source 与
 * media-playback 两处 spec 都要求向用户报告失败原因，而不是静默失败。
 */
export async function resolveTrack(track: Track): Promise<ResolvedMedia> {
  // 缓存判定必须在取来源**之前**：插件被卸载后 `getSource` 返回 undefined，
  // 而已下载的曲目此时仍应照常播放（offline-cache spec）。
  // 本地文件返回的地址不需要请求头，缓存命中同理，只给 uri。
  const cachedUri = await resolveCachedFileUri(track.id);
  if (cachedUri) return { uri: cachedUri };

  const source = getSource(track.sourceId);

  if (!source) {
    // 来源已被移除（例如 iOS 构建裁剪掉插件模块后，用户从 Android 备份恢复的插件曲目）。
    // 报告不可播放即可，MUST NOT 崩溃或卡死队列——播放层据此跳到下一首。
    throw new MediaResolutionError(
      'source-not-registered',
      `曲目来源「${track.sourceId}」不可用，当前版本不支持该来源。`,
    );
  }

  try {
    return await source.resolve(track);
  } catch (error) {
    if (error instanceof MediaResolutionError) throw error;
    throw new MediaResolutionError(
      'unknown',
      error instanceof Error ? error.message : '解析播放地址时发生未知错误。',
    );
  }
}
