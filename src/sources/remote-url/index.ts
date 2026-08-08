// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { SOURCE_REMOTE_URL, type SourceRef, type Track } from '@/domain/model/track';
import { MediaResolutionError, type MediaSource, type ResolvedMedia } from '@/sources/contract';

export const remoteUrlSource: MediaSource = {
  id: SOURCE_REMOTE_URL,
  displayName: '远程地址',

  resolve(track: Track): Promise<ResolvedMedia> {
    const uri = track.sourceRef.uri;
    if (typeof uri !== 'string' || uri.length === 0) {
      return Promise.reject(
        new MediaResolutionError('invalid-source-ref', '曲目记录缺少地址信息，无法播放。'),
      );
    }

    // 刻意不在这里做可达性预检。地址是否可达要到实际请求时才知道，预检既多一次
    // 网络往返，也无法保证随后的播放请求一定成功；播放失败由播放层统一报告
    // （media-source spec 只要求「播放时地址失效要报告原因且曲目保留在曲库中」，
    // 没有要求解析阶段就断言可达）。
    //
    // 这条路径与本地文件来源刻意保持差异——一个走文件系统的存在性检查，一个完全
    // 不做检查，正是 design.md 用来暴露抽象泄漏的手段：两者返回的形状必须一致。
    return Promise.resolve({ uri });
  },
};

/**
 * 校验用户输入的地址。media-source spec 要求非法输入在加入曲库前就被拒绝，
 * 不创建曲目记录。
 */
export function parseRemoteUrl(raw: string): { url: URL; sourceKey: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  // 只接受 http/https。file: 之类的协议应当走本地文件来源，
  // 混进来会让「来源标识决定解析方式」这条规则失效。
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  return { url, sourceKey: url.toString() };
}

/** 地址没有可用标签时的标题推断：取路径末段并去掉扩展名。 */
export function inferTitleFromUrl(url: URL): string {
  const segments = url.pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) return url.hostname;

  const decoded = safeDecode(last);
  const dot = decoded.lastIndexOf('.');
  const stem = dot > 0 ? decoded.slice(0, dot) : decoded;
  return stem || url.hostname;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function buildRemoteSourceRef(url: URL): SourceRef {
  // 只存地址本身。远程直链没有需要重新解析的中间信息，
  // 这也是契约「保存重解析所需信息」在最简单来源上的形态。
  return { uri: url.toString() };
}
