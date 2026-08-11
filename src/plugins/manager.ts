// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { File } from 'expo-file-system';

import type { CompatVerdict, InstallOutcome, PluginSummary } from '@/plugins/api';
import { checkAppVersion, compareVersions } from '@/plugins/host/compat';
import { PluginLoadError, loadPlugin, type LoadedPlugin } from '@/plugins/host/loader';
import { createPluginSource } from '@/plugins/source';
import {
  deletePluginCode,
  readManifest,
  readPluginCode,
  readUserVariables,
  writeManifest,
  writePluginCode,
  writeUserVariables,
  type InstalledPluginRecord,
} from '@/plugins/store/storage';
import { registerSource, unregisterSource } from '@/sources/registry';

/**
 * 插件的生命周期：安装、更新、卸载、启动时加载，以及与来源注册表的同步。
 *
 * 注册方向是**插件推向注册表**，而不是注册表来拉插件。这样 `src/sources` 不需要
 * 知道插件的存在，iOS 侧的引用链在门面处就断开了（design.md 决策 6）。
 */

type PluginEntry = {
  record: InstalledPluginRecord;
  /** 加载失败时为 null——插件仍在已安装列表里，但不提供任何能力。 */
  loaded: LoadedPlugin | null;
  loadError: string | null;
  compat: CompatVerdict;
};

const ENTRIES = new Map<string, PluginEntry>();

/**
 * 用户变量的内存副本。
 *
 * 必须是同步可读的：插件在自己的代码里同步调用 `env.getUserVariables()`，
 * 那里没有等待 IO 的机会。写入时同时更新内存与持久层。
 */
const USER_VARIABLES = new Map<string, Record<string, string>>();

export function listPlugins(): PluginSummary[] {
  return [...ENTRIES.values()]
    .map(toSummary)
    .sort((left, right) => left.platform.localeCompare(right.platform));
}

function toSummary(entry: PluginEntry): PluginSummary {
  const meta = entry.loaded?.meta;
  return {
    platform: entry.record.platform,
    version: meta?.version ?? entry.record.version,
    author: meta?.author ?? null,
    srcUrl: meta?.srcUrl ?? entry.record.srcUrl,
    cacheControl: meta?.cacheControl ?? null,
    userVariables: meta?.userVariables ?? [],
    canSearchMusic: meta?.canSearchMusic ?? false,
    canResolveMedia: meta?.canResolveMedia ?? false,
    declaredSearchTypes: meta?.supportedSearchType ?? null,
    compat: entry.compat,
    loadError: entry.loadError,
  };
}

/**
 * 可用于**音乐**搜索的插件。
 *
 * 判据是 `canSearchMusic` 而不是「有没有 search 方法」——理由见 `protocol.ts` 中该字段
 * 的说明：歌词类插件同样实现了 search，把它算进来只会让用户看到一条它本来就做不到的失败。
 */
export function searchablePlugins(): LoadedPlugin[] {
  return [...ENTRIES.values()]
    .map((entry) => entry.loaded)
    .filter((loaded): loaded is LoadedPlugin => loaded !== null && loaded.meta.canSearchMusic);
}

/**
 * 应用启动时加载全部已安装插件。
 *
 * 单个插件加载失败只影响它自己：它以「不可用 + 失败原因」的形态留在列表里，
 * 其余插件照常注册（plugin-source spec「插件故障不影响宿主」）。
 */
export async function initPlugins(): Promise<void> {
  const records = await readManifest();

  for (const record of records) {
    USER_VARIABLES.set(record.platform, await readUserVariables(record.platform));
  }
  for (const record of records) {
    activateFromDisk(record);
  }
}

/**
 * 执行插件代码。
 *
 * `getUserVariables` 经由一个可变的持有者间接读取，而不是先拿插件名再重新加载一次——
 * 插件名要执行完才知道，而重复执行意味着插件顶层的副作用也跑两遍。
 */
function evaluate(code: string): LoadedPlugin {
  const holder = { platform: '' };
  const loaded = loadPlugin(code, {
    getUserVariables: () => USER_VARIABLES.get(holder.platform) ?? {},
  });
  holder.platform = loaded.meta.platform;
  return loaded;
}

function activateFromDisk(record: InstalledPluginRecord): void {
  const code = readPluginCode(record.fileName);
  if (code === null) {
    ENTRIES.set(record.platform, {
      record,
      loaded: null,
      loadError: '插件文件已丢失，请重新安装。',
      compat: 'unknown',
    });
    return;
  }

  try {
    activate(record, evaluate(code));
  } catch (error) {
    ENTRIES.set(record.platform, {
      record,
      loaded: null,
      loadError: error instanceof PluginLoadError ? error.message : describe(error),
      compat: 'unknown',
    });
  }
}

function activate(record: InstalledPluginRecord, loaded: LoadedPlugin): void {
  ENTRIES.set(record.platform, {
    record,
    loaded,
    loadError: null,
    compat: checkAppVersion(loaded.meta.appVersion),
  });
  registerSource(createPluginSource(loaded));
}

/**
 * 从设备本地文件安装。
 *
 * 用 `expo-file-system` 自带的选择器，与本地音频文件导入保持一致——能力等价且不新增
 * 依赖。不限定 MIME 类型：各家文件管理器给 `.js` 报的类型五花八门，限定反而会让用户
 * 在选择器里看不到自己的插件文件。
 */
export async function installFromFile(): Promise<InstallOutcome> {
  const picked = await File.pickFileAsync();
  if (picked.canceled) return { kind: 'failed', reason: '已取消。' };

  try {
    return await install(await picked.result.text(), null);
  } catch (error) {
    return { kind: 'failed', reason: `读取插件文件失败：${describe(error)}` };
  }
}

/** 从用户输入的地址安装。 */
export async function installFromUrl(input: string): Promise<InstallOutcome> {
  const url = input.trim();
  if (!/^https?:\/\//i.test(url)) {
    return { kind: 'failed', reason: '请输入以 http:// 或 https:// 开头的插件地址。' };
  }

  let code: string;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { kind: 'failed', reason: `下载失败：服务器返回 ${response.status}。` };
    }
    code = await response.text();
  } catch (error) {
    return { kind: 'failed', reason: `下载失败：${describe(error)}` };
  }

  // 下载成功但内容不是合法插件时，install 内部在写入任何文件之前就会失败返回，
  // 因此不存在「下载了一半就留下一个装不上的插件」的中间态。
  return install(code, url);
}

/** 按插件自述的 srcUrl 更新。未声明该地址的插件不提供更新入口。 */
export async function updatePlugin(platform: string): Promise<InstallOutcome> {
  const entry = ENTRIES.get(platform);
  const srcUrl = entry?.loaded?.meta.srcUrl ?? entry?.record.srcUrl ?? null;
  if (!srcUrl) {
    return { kind: 'failed', reason: '该插件未声明更新地址，无法自动更新。' };
  }
  return installFromUrl(srcUrl);
}

async function install(code: string, srcUrl: string | null): Promise<InstallOutcome> {
  // 先执行再落盘：非法内容在此被挡下，磁盘上不会留下任何痕迹。
  let loaded: LoadedPlugin;
  try {
    loaded = evaluate(code);
  } catch (error) {
    return {
      kind: 'failed',
      reason: error instanceof PluginLoadError ? error.message : describe(error),
    };
  }

  const meta = loaded.meta;
  const existing = ENTRIES.get(meta.platform);
  if (existing) {
    const order = compareVersions(meta.version, existing.record.version);
    // 版本更高才直接覆盖。相同、更低、以及任一侧版本号无法解析时都要用户确认——
    // 无法判断时默默覆盖，与静默降级是同一类错误（plugin-source spec）。
    if (order === null || order <= 0) {
      return {
        kind: 'needs-confirmation',
        platform: meta.platform,
        installedVersion: existing.record.version,
        incomingVersion: meta.version,
        confirm: () => commit(code, loaded, srcUrl),
      };
    }
  }

  return commit(code, loaded, srcUrl);
}

async function commit(
  code: string,
  loaded: LoadedPlugin,
  srcUrl: string | null,
): Promise<InstallOutcome> {
  const meta = loaded.meta;
  const previous = ENTRIES.get(meta.platform);

  const record: InstalledPluginRecord = {
    platform: meta.platform,
    version: meta.version,
    srcUrl: meta.srcUrl ?? srcUrl,
    fileName: writePluginCode(code),
    installedAt: Date.now(),
  };

  if (previous) unregisterSource(previous.record.platform);
  activate(record, loaded);

  try {
    await writeManifest([...ENTRIES.values()].map((entry) => entry.record));
  } catch (error) {
    // 清单没写成功就等于没装上。回滚到上一状态，不留下重启后凭空多出一个插件的隐患。
    deletePluginCode(record.fileName);
    unregisterSource(record.platform);
    ENTRIES.delete(record.platform);
    if (previous) activateFromDisk(previous.record);
    return { kind: 'failed', reason: `保存插件失败：${describe(error)}` };
  }

  // 旧版本的代码文件在清单落定之后才删，顺序反过来会在写清单失败时把旧插件也弄丢。
  if (previous) deletePluginCode(previous.record.fileName);

  USER_VARIABLES.set(meta.platform, await readUserVariables(meta.platform));

  return {
    kind: 'installed',
    platform: meta.platform,
    version: meta.version,
    replaced: !!previous,
  };
}

/**
 * 卸载。
 *
 * **不碰曲库**：plugin-source spec 明确要求卸载 MUST NOT 删除该插件的存量曲目，
 * 它们保留在曲库与歌单中，播放时由 `resolveTrack` 的 `source-not-registered` 分支
 * 报告「来源不可用」。用户变量同样保留，重装后无需重填（见 storage.ts 的说明）。
 */
export async function uninstallPlugin(platform: string): Promise<void> {
  const entry = ENTRIES.get(platform);
  if (!entry) return;

  unregisterSource(platform);
  ENTRIES.delete(platform);
  await writeManifest([...ENTRIES.values()].map((item) => item.record));
  deletePluginCode(entry.record.fileName);
}

export function getUserVariables(platform: string): Record<string, string> {
  return USER_VARIABLES.get(platform) ?? {};
}

export async function saveUserVariables(
  platform: string,
  values: Record<string, string>,
): Promise<void> {
  USER_VARIABLES.set(platform, values);
  await writeUserVariables(platform, values);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
