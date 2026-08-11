// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { CandidateTrack } from '@/domain/model/candidate-track';
import type { PluginUserVariable } from '@/plugins/protocol';

/**
 * 插件能力的门面契约。
 *
 * 本文件**只有类型**，不引用任何实现，因此两端都能安全依赖。`index.ts`（平台中立，
 * iOS 走这条）给出全空实现，`index.android.ts` 转发到真实实现——把契约写成一个对象
 * 类型而不是一组独立导出，是为了让两端的形状由编译器强制对齐：任何一侧多一个或少一个
 * 成员都编译不过（design.md 决策 6）。
 */

/** 插件声明的宿主版本范围与当前宿主的关系。结论只用于提示，不拦截安装。 */
export type CompatVerdict = 'satisfied' | 'not-satisfied' | 'unknown';

/** 面向界面的插件信息。界面只接触本类型，不接触插件对象本身。 */
export type PluginSummary = {
  platform: string;
  version: string | null;
  author: string | null;
  /** 有更新地址才允许「更新」。为 null 时更新入口不可用。 */
  srcUrl: string | null;
  /** 插件自述的可缓存声明。只展示，不影响行为（design.md 决策 5）。 */
  cacheControl: string | null;
  userVariables: PluginUserVariable[];
  /** 能否用于音乐搜索。歌词类插件虽有 `search` 方法但只认 `lyric`，这里为 false。 */
  canSearchMusic: boolean;
  canResolveMedia: boolean;
  /** 插件自述支持的搜索类型。用于如实告诉用户「它能搜，但搜的不是歌」。 */
  declaredSearchTypes: string[] | null;
  compat: CompatVerdict;
  /** 非 null 时该插件当前不可用，字符串是给用户看的原因。 */
  loadError: string | null;
};

export type InstallOutcome =
  | { kind: 'installed'; platform: string; version: string | null; replaced: boolean }
  | {
      kind: 'needs-confirmation';
      platform: string;
      installedVersion: string | null;
      incomingVersion: string | null;
      /** 用户确认后继续安装。插件代码已在内存中，不必重新下载。 */
      confirm: () => Promise<InstallOutcome>;
    }
  | { kind: 'failed'; reason: string };

export type PluginSearchOutcome = {
  /** 各插件本页结果的合并。条目自带 sourceId，界面据此标明来自哪个插件。 */
  candidates: CandidateTrack[];
  /** 尚未取完的插件。下一页把它原样传回即可。为空表示到底了。 */
  continuing: string[];
  /** 失败的插件与原因。单个插件失败不影响其余插件的结果。 */
  failures: { platform: string; reason: string }[];
};

export type PluginsFacade = {
  /** 当前平台是否具备插件能力。iOS 恒为 false。 */
  readonly supported: boolean;
  /** 注入给插件的依赖名列表。对插件作者是兼容性契约，需要向用户与文档明示。 */
  readonly injectedModules: readonly string[];

  /** 应用启动时加载全部已安装插件。 */
  init: () => Promise<void>;
  list: () => PluginSummary[];
  /** 是否存在可用于搜索的插件。为 false 时搜索界面应说明原因而不是给一个空结果页。 */
  hasSearchable: () => boolean;

  installFromFile: () => Promise<InstallOutcome>;
  installFromUrl: (url: string) => Promise<InstallOutcome>;
  update: (platform: string) => Promise<InstallOutcome>;
  uninstall: (platform: string) => Promise<void>;

  getUserVariables: (platform: string) => Record<string, string>;
  saveUserVariables: (platform: string, values: Record<string, string>) => Promise<void>;

  search: (
    query: string,
    page: number,
    platforms?: readonly string[],
  ) => Promise<PluginSearchOutcome>;
};
