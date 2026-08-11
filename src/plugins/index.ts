// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { PluginsFacade } from '@/plugins/api';

/**
 * 平台中立的插件门面——**空实现**。
 *
 * iOS 解析到的是本文件；`index.android.ts` 才转发到真实实现。这是 iOS 裁剪的全部
 * 机制（design.md 决策 6）：打包器按静态 import 关系收集模块，与代码是否可达无关，
 * 因此只有让 iOS 侧根本不存在那条 import，插件宿主与 `cheerio` 等专属依赖才不会
 * 进入产物。运行时判断（`Platform.OS === 'android'`）做不到这一点。
 *
 * **本文件不得 import 任何插件实现模块**，一行都不行——那会让整条依赖链重新长回来。
 *
 * `supported: false` 让界面据此完全不渲染插件相关入口，而不是渲染一个「不可用」的入口：
 * plugin-source spec 要求 iOS 上插件相关的界面入口不存在。
 */
/**
 * 这条原因正常情况下用户永远看不到——界面在 `supported` 为 false 时根本不会给出入口。
 * 它存在只是为了让门面的每个方法都有确定行为，而不是留一个会静默成功的空壳。
 */
const UNSUPPORTED = { kind: 'failed', reason: '当前平台不支持插件。' } as const;

export const Plugins: PluginsFacade = {
  supported: false,
  injectedModules: [],

  init: () => Promise.resolve(),
  list: () => [],
  hasSearchable: () => false,

  installFromFile: () => Promise.resolve(UNSUPPORTED),
  installFromUrl: () => Promise.resolve(UNSUPPORTED),
  update: () => Promise.resolve(UNSUPPORTED),
  uninstall: () => Promise.resolve(),

  getUserVariables: () => ({}),
  saveUserVariables: () => Promise.resolve(),

  search: () => Promise.resolve({ candidates: [], continuing: [], failures: [] }),
};
