// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import axios from 'axios';
import bigInt from 'big-integer';
// `cheerio` 的主入口引用 `undici` 与 `node:stream`（为其 fromURL 能力），Metro 无法解析，
// 打包直接失败。slim 构建去掉了这条链路（spike 结论，见 design.md）。
// 插件书写的仍是 `require('cheerio')`——把名字映射到 slim 实现是宿主的职责，插件无需改写；
// 唯一缺失的 fromURL 本就应由插件通过注入的 axios 完成。
import * as cheerio from 'cheerio/slim';
import CryptoJS from 'crypto-js';
import dayjs from 'dayjs';
import he from 'he';
import qs from 'qs';

/**
 * 注入给插件的依赖白名单。
 *
 * plugin-source spec：可用依赖的集合 MUST 在文档中明示、MUST 保持稳定——**移除其中
 * 任何一项都会使既有插件失效**。因此这张表是对插件作者的兼容性契约，不是实现细节，
 * 增删要按破坏性变更对待（README 有对应的公开说明）。
 *
 * 白名单之外的引入一律失败：宿主不做「找不到就返回 undefined」的宽容处理，
 * 那只会把错误推迟到插件内部某个难以归因的位置（plugin-source spec 要求
 * 「说明失败的插件与原因」）。
 */
const MODULES: Readonly<Record<string, unknown>> = {
  axios,
  cheerio,
  'crypto-js': CryptoJS,
  dayjs,
  'big-integer': bigInt,
  qs,
  he,
};

/** 供界面与文档展示的依赖名列表。 */
export const INJECTED_MODULE_NAMES: readonly string[] = Object.keys(MODULES);

export class PluginRequireError extends Error {
  constructor(moduleName: string) {
    super(`插件引入了未提供的模块「${moduleName}」。`);
    this.name = 'PluginRequireError';
  }
}

/**
 * 插件可见的 `require`。
 *
 * 只认白名单里的确切模块名，不支持子路径（如 `crypto-js/md5`）——支持子路径意味着
 * 要把整个包的模块图打进产物，与「依赖集合是一张明确的表」相矛盾。
 */
export function createPluginRequire(): (moduleName: string) => unknown {
  return (moduleName: string): unknown => {
    if (Object.prototype.hasOwnProperty.call(MODULES, moduleName)) return MODULES[moduleName];
    throw new PluginRequireError(moduleName);
  };
}
