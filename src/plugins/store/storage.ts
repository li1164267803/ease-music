// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';

/**
 * 插件自身的持久化：插件代码文件、已安装清单、用户变量。
 *
 * **刻意不进曲库的 SQLite 迁移。** 迁移文件在 `src/domain` 下，是平台中立的核心代码；
 * 往那里加一张插件表，等于让 iOS 产物里带上一张永远为空的表和一段与插件有关的 DDL，
 * 与决策 6「iOS 上插件相关的一切都不存在」相抵触。插件数据量极小（一份清单 + 几 KB
 * 变量），键值存储足够，且完全收敛在 `src/plugins/` 内。
 */

const PLUGIN_DIR = 'plugins';
const MANIFEST_KEY = 'plugins.installed';
const USER_VARIABLES_PREFIX = 'plugins.userVariables.';
const RISK_ACKNOWLEDGED_KEY = 'plugins.riskAcknowledged';

/**
 * 用户是否已经确认过风险告知。plugin-source spec 只要求「首次安装前」告知，
 * 因此确认一次即可，不必每次安装都拦一道。
 */
export async function readRiskAcknowledged(): Promise<boolean> {
  return (await Storage.getItemAsync(RISK_ACKNOWLEDGED_KEY)) === 'true';
}

export async function writeRiskAcknowledged(): Promise<void> {
  await Storage.setItemAsync(RISK_ACKNOWLEDGED_KEY, 'true');
}

/** 已安装插件的清单条目。插件代码本身在文件里，这里只存索引信息。 */
export type InstalledPluginRecord = {
  /** 插件自述的插件名，同时是来源标识与本条记录的主键。 */
  platform: string;
  version: string | null;
  /** 插件自述的更新地址。为 null 时更新入口不可用。 */
  srcUrl: string | null;
  /** 插件代码在插件目录下的文件名。用 UUID 而非插件名——插件名可能含路径分隔符。 */
  fileName: string;
  installedAt: number;
};

export async function readManifest(): Promise<InstalledPluginRecord[]> {
  const raw = await Storage.getItemAsync(MANIFEST_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecordEntry) : [];
  } catch {
    // 清单损坏时按「一个插件都没装」处理：插件文件还在磁盘上，用户重装即可恢复，
    // 而让启动流程因为一行坏 JSON 就失败是不可接受的。
    return [];
  }
}

export async function writeManifest(records: InstalledPluginRecord[]): Promise<void> {
  await Storage.setItemAsync(MANIFEST_KEY, JSON.stringify(records));
}

function isRecordEntry(value: unknown): value is InstalledPluginRecord {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.platform === 'string' && typeof entry.fileName === 'string';
}

function pluginDirectory(): Directory {
  const directory = new Directory(Paths.document, PLUGIN_DIR);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/** 写入插件代码，返回其文件名。每次写入都用新文件名，见 `replacePluginCode` 的说明。 */
export function writePluginCode(code: string): string {
  const fileName = `${randomUUID()}.js`;
  const file = new File(pluginDirectory(), fileName);
  file.create();
  file.write(code);
  return fileName;
}

export function readPluginCode(fileName: string): string | null {
  const file = new File(pluginDirectory(), fileName);
  if (!file.exists) return null;
  return file.textSync();
}

export function deletePluginCode(fileName: string): void {
  const file = new File(pluginDirectory(), fileName);
  if (file.exists) file.delete();
}

export async function readUserVariables(platform: string): Promise<Record<string, string>> {
  const raw = await Storage.getItemAsync(USER_VARIABLES_PREFIX + platform);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') values[key] = value;
    }
    return values;
  } catch {
    return {};
  }
}

/**
 * 用户变量按插件名存放，而插件名在更新前后不变——因此「插件更新后已填值保留」
 * （plugin-source spec）不需要任何额外逻辑。
 *
 * 卸载同样不清除：spec 要求重装后曲目「恢复正常播放，无需用户重新添加」，而多数插件
 * 没有 cookie 就取不到地址。让用户重装后再填一次 cookie，等于没有恢复。
 */
export async function writeUserVariables(
  platform: string,
  values: Record<string, string>,
): Promise<void> {
  await Storage.setItemAsync(USER_VARIABLES_PREFIX + platform, JSON.stringify(values));
}
