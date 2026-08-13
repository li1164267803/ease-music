// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { SourceId, Track } from '@/domain/model/track';

/**
 * 统一的媒体解析契约（design.md 决策 4）。
 *
 * 形状固定为「可播放地址 + HTTP 请求头 + User-Agent」，覆盖已识别的全部来源：
 * 本地文件返回文件 URI；远程直链返回 URL 且无需请求头；网盘返回带鉴权 token 的
 * 临时直链加必要请求头；插件返回其解析结果加防盗链请求头。
 *
 * 上层（曲库、播放器）MUST NOT 依赖任何特定来源的私有字段——这是 media-source spec
 * 的硬性要求，也由 eslint 的 no-restricted-imports 规则从引用层面阻断。
 */
export type ResolvedMedia = {
  uri: string;
  headers?: Record<string, string>;
  userAgent?: string;
};

export type MediaSource = {
  readonly id: SourceId;
  readonly displayName: string;
  /**
   * 把曲目解析为可播放地址。**每次播放前实时调用**，不缓存结果——
   * 网盘与插件返回的地址有时效性。
   *
   * 「不缓存结果」说的是**地址**。离线缓存（C2）缓存的是**音频字节**，二者不冲突：
   * 地址仍然每次实时解析，只是命中本地缓存时根本不走到这里。
   */
  resolve(track: Track): Promise<ResolvedMedia>;
  /**
   * 该来源的曲目能否被下载到本地（add-offline-cache/design.md 决策 9）。
   *
   * **缺省视为 `true`**——这是对契约的增量扩展，既有来源与将来的新来源不写这个字段
   * 即可，media-source spec「新增来源仅需实现解析契约与注册标识」不受影响。
   * 音频本就在设备上、不依赖网络的来源声明 `false`：再复制一份纯属浪费。
   */
  readonly cacheable?: boolean;
};

export type MediaResolutionErrorCode =
  /** 曲目归属的来源标识在注册表中不存在（例如来源已被移除） */
  | 'source-not-registered'
  /** 来源的底层资源已不存在（本地文件被删除、网盘文件被清理） */
  | 'media-missing'
  /** 地址存在但无法访问（网络不可达、服务端报错、鉴权失败） */
  | 'media-unreachable'
  /** 曲目记录本身损坏，缺少重新解析所需的信息 */
  | 'invalid-source-ref'
  | 'unknown';

/**
 * 解析失败的统一表达。
 *
 * 携带面向用户的中文说明，因为 media-source 与 media-playback 两处 spec 都要求
 * 「向用户报告失败原因」而不是静默失败。`unavailable` 指示曲库是否应把该曲目标记
 * 为失效——地址暂时不可达（断网）不该让曲目被标记失效。
 */
export class MediaResolutionError extends Error {
  readonly code: MediaResolutionErrorCode;
  /** 是否应把曲目在曲库中标记为失效 */
  readonly marksUnavailable: boolean;

  constructor(code: MediaResolutionErrorCode, message: string, marksUnavailable = false) {
    super(message);
    this.name = 'MediaResolutionError';
    this.code = code;
    this.marksUnavailable = marksUnavailable;
  }
}
