// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import {
  DEFAULT_PRIMARY_KEY,
  type PluginCacheControl,
  type PluginInstance,
  type PluginMeta,
  type PluginSearchType,
  type PluginUserVariable,
} from '@/plugins/protocol';
import { createPluginRequire } from '@/plugins/host/deps';

/**
 * 插件文本 → 插件对象。
 *
 * 用 `Function` 构造器在应用自身的 JS 上下文中执行（design.md 决策 1）。**这里没有任何
 * 隔离**：插件能做应用能做的一切。注释里写清楚这一点，是为了让后来者不会误以为
 * 这层包装提供了安全边界——它提供的只有模块协议和依赖白名单。
 *
 * 已验证 RN 0.86 随附的 release 版 Hermes 完整保留了编译器，主包被预编译为 HBC
 * 不影响此处的动态执行（见 design.md「Spike 结论」）。
 */

export type PluginEnv = {
  /** 取当前的用户变量。做成回调而非快照，用户改完即时生效，无需重新加载插件。 */
  getUserVariables: () => Record<string, string>;
};

export class PluginLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PluginLoadError';
  }
}

export type LoadedPlugin = {
  meta: PluginMeta;
  instance: PluginInstance;
};

export function loadPlugin(code: string, env: PluginEnv): LoadedPlugin {
  const instance = evaluateModule(code, env);
  const meta = readMeta(instance);
  return { meta, instance };
}

function evaluateModule(code: string, env: PluginEnv): PluginInstance {
  const module: { exports: unknown } = { exports: {} };

  let factory: (...args: unknown[]) => void;
  try {
    factory = new Function('module', 'exports', 'require', 'console', 'env', code) as (
      ...args: unknown[]
    ) => void;
  } catch (error) {
    // 语法错误在构造阶段就会抛出，此时插件代码一行都还没执行
    throw new PluginLoadError(`插件代码无法解析：${describe(error)}`, { cause: error });
  }

  try {
    factory(module, module.exports, createPluginRequire(), console, {
      getUserVariables: env.getUserVariables,
      os: 'android',
    });
  } catch (error) {
    throw new PluginLoadError(`插件代码执行失败：${describe(error)}`, { cause: error });
  }

  return unwrapExports(module.exports);
}

/**
 * 取插件对象。兼容由 ES 模块转译而来、把内容挂在 `default` 上的插件——
 * 这类插件的外层 `module.exports` 只有 `default` 与 `__esModule`，没有 `platform`。
 */
function unwrapExports(exported: unknown): PluginInstance {
  if (!isRecord(exported)) {
    throw new PluginLoadError('插件没有导出任何内容，不是合法插件。');
  }
  if (typeof exported.platform !== 'string' && isRecord(exported.default)) {
    return exported.default as PluginInstance;
  }
  return exported as PluginInstance;
}

/**
 * 元字段校验与归一（plugin-source spec「插件的标识、版本与生命周期」）。
 *
 * 只有插件名是必需的——它同时是插件的唯一标识与其曲目的来源标识，缺了它整条链路都
 * 无从谈起。其余字段一律给出确定的缺省值，不因为插件少写一个可选字段就拒绝加载。
 */
function readMeta(instance: PluginInstance): PluginMeta {
  const platform = typeof instance.platform === 'string' ? instance.platform.trim() : '';
  if (!platform) {
    throw new PluginLoadError('插件未声明插件名（platform），不是合法插件。');
  }

  const supportedSearchType = readSearchTypes(instance.supportedSearchType);

  return {
    platform,
    version: optionalString(instance.version),
    srcUrl: optionalString(instance.srcUrl),
    author: optionalString(instance.author),
    appVersion: optionalString(instance.appVersion),
    primaryKey: readPrimaryKey(instance.primaryKey),
    cacheControl: readCacheControl(instance.cacheControl),
    userVariables: readUserVariables(instance.userVariables),
    supportedSearchType,
    canSearchMusic:
      typeof instance.search === 'function' &&
      (supportedSearchType === null || supportedSearchType.includes('music')),
    canResolveMedia: typeof instance.getMediaSource === 'function',
  };
}

function readPrimaryKey(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_PRIMARY_KEY];
  const keys = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return keys.length > 0 ? keys : [...DEFAULT_PRIMARY_KEY];
}

const CACHE_CONTROLS: readonly PluginCacheControl[] = ['cache', 'no-cache', 'no-store'];

function readCacheControl(value: unknown): PluginCacheControl {
  // 缺省取最保守的一档。本项目始终实时解析，这个值只被记录不被采纳（design.md 决策 5）。
  return CACHE_CONTROLS.includes(value as PluginCacheControl)
    ? (value as PluginCacheControl)
    : 'no-store';
}

const SEARCH_TYPES: readonly PluginSearchType[] = ['music', 'album', 'artist', 'sheet', 'lyric'];

function readSearchTypes(value: unknown): PluginSearchType[] | null {
  if (!Array.isArray(value)) return null;
  const types = value.filter((item): item is PluginSearchType =>
    SEARCH_TYPES.includes(item as PluginSearchType),
  );
  return types.length > 0 ? types : null;
}

function readUserVariables(value: unknown): PluginUserVariable[] {
  if (!Array.isArray(value)) return [];
  const variables: PluginUserVariable[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.key !== 'string' || !item.key) continue;
    variables.push({
      key: item.key,
      name: typeof item.name === 'string' ? item.name : undefined,
      hint: typeof item.hint === 'string' ? item.hint : undefined,
      field: item.field === 'textarea' ? 'textarea' : 'input',
    });
  }
  return variables;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
