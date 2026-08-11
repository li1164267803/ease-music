// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { Track } from '@/domain/model/track';
import { readPluginItem } from '@/plugins/candidate';
import { PluginCallError, invokePlugin } from '@/plugins/host/invoke';
import type { LoadedPlugin } from '@/plugins/host/loader';
import type { PluginQuality } from '@/plugins/protocol';
import { MediaResolutionError, type MediaSource, type ResolvedMedia } from '@/sources/contract';

/**
 * 音质档位。协议允许 low / standard / high / super 四档。
 *
 * 当前固定取 standard：档位选择需要一套设置界面与「该档不可用时如何降级」的规则，
 * 属于独立的产品决策，不在本切片内。写成常量而不是留 TODO，是为了让这里的取值有据可查。
 */
const QUALITY: PluginQuality = 'standard';

/**
 * 把一个已加载的插件适配成来源（design.md 决策 2：一个插件即一个来源）。
 *
 * 播放层不知道这里是插件——它只经 `resolveTrack` 拿到「地址 + 请求头 + UA」，
 * 与本地文件、远程直链走的是同一条路。
 */
export function createPluginSource(loaded: LoadedPlugin): MediaSource {
  const { meta, instance } = loaded;

  return {
    id: meta.platform,
    displayName: meta.platform,

    async resolve(track: Track): Promise<ResolvedMedia> {
      const item = readPluginItem(track.sourceRef);
      if (!item) {
        throw new MediaResolutionError(
          'invalid-source-ref',
          '曲目记录缺少插件所需的信息，无法解析播放地址。',
        );
      }

      // 每次播放都真实调用一次插件。插件返回的地址有时效性，缓存它只会把失败推迟到
      // 用户下次播放时才发生，且难以归因（design.md 决策 5）。插件自述的 cacheControl
      // 只被读取与展示，不改变这里的行为——本项目等价于始终按最保守的 no-store 处理。
      try {
        return await invokePlugin<ResolvedMedia>({
          platform: meta.platform,
          method: 'getMediaSource',
          call: instance.getMediaSource && (() => instance.getMediaSource?.(item, QUALITY)),
          parse: parseMediaSource,
        });
      } catch (error) {
        throw toResolutionError(error);
      }
    },
  };
}

function parseMediaSource(raw: unknown): ResolvedMedia | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const result = raw as Record<string, unknown>;

  const url = result.url;
  if (typeof url !== 'string' || url.trim().length === 0) return null;

  return {
    uri: url.trim(),
    headers: readHeaders(result.headers),
    userAgent: typeof result.userAgent === 'string' ? result.userAgent : undefined,
  };
}

/** 请求头只接受字符串值。插件偶尔会塞进数字（如 Range），一并转成字符串而不是整条丢弃。 */
function readHeaders(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const headers: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') headers[key] = item;
    else if (typeof item === 'number') headers[key] = String(item);
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * 插件故障 → 统一的解析失败。
 *
 * **一律不标记曲目失效**（`marksUnavailable` 保持 false）：插件解析失败绝大多数是
 * 暂时性的——网络不通、cookie 过期、服务端限流。把曲目标记为失效会让用户以为曲目
 * 没了，而 plugin-source spec 要求的是「曲目保留在曲库中不被自动删除」。
 */
function toResolutionError(error: unknown): MediaResolutionError {
  if (error instanceof MediaResolutionError) return error;

  if (error instanceof PluginCallError) {
    const code = error.kind === 'not-implemented' ? 'unknown' : 'media-unreachable';
    return new MediaResolutionError(code, `${error.message}该曲目暂时无法播放。`);
  }

  return new MediaResolutionError(
    'unknown',
    error instanceof Error ? error.message : '解析播放地址时发生未知错误。',
  );
}
