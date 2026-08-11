// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { PluginsFacade } from '@/plugins/api';
import { INJECTED_MODULE_NAMES } from '@/plugins/host/deps';
import {
  getUserVariables,
  initPlugins,
  installFromFile,
  installFromUrl,
  listPlugins,
  saveUserVariables,
  searchablePlugins,
  uninstallPlugin,
  updatePlugin,
} from '@/plugins/manager';
import { searchPlugins } from '@/plugins/search';

/**
 * Android 侧的插件门面。
 *
 * 这是**整个插件模块唯一的对外出口**，也是 iOS 裁剪的分界线：插件宿主、协议适配、
 * 依赖白名单及其背后的 `cheerio` 等专属依赖，全部只被本文件（及其下游）引用。
 * 平台中立的 `index.ts` 一行都不 import 它们，因此 iOS 产物里根本不存在这条依赖链。
 *
 * 形状由 `PluginsFacade` 与 `index.ts` 强制对齐，两边少一个成员都编译不过。
 */
export const Plugins: PluginsFacade = {
  supported: true,
  injectedModules: INJECTED_MODULE_NAMES,

  init: initPlugins,
  list: listPlugins,
  hasSearchable: () => searchablePlugins().length > 0,

  installFromFile,
  installFromUrl,
  update: updatePlugin,
  uninstall: uninstallPlugin,

  getUserVariables,
  saveUserVariables,

  search: searchPlugins,
};
