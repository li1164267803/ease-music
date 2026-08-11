// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { SourceId } from '@/domain/model/track';
import type { MediaSource } from '@/sources/contract';
import { localFileSource } from '@/sources/local-file';
import { remoteUrlSource } from '@/sources/remote-url';

/**
 * 来源注册表。容纳两类来源（media-source spec「来源注册与归属识别」）：
 *
 * - **内置来源**：随应用一同确定，整个生命周期内常驻，不可注销
 * - **动态来源**：由用户在运行时安装/卸载，数量与标识运行时才确定
 *
 * 动态来源目前只有插件，而**一个插件即一个来源**（design.md 决策 2）：曲库的去重键是
 * `sourceId + sourceKey`，若所有插件共用一个 sourceId，不同插件返回的同 id 曲目会被
 * 误判为同一首，卸载单个插件时也无法定位其存量曲目。
 *
 * 本文件不认识插件——注册是反向的，由插件模块在安装/卸载时调用下面两个函数。这样
 * `src/sources` 不引用 `src/plugins`，iOS 侧的引用链自然断开（决策 6）。
 */
const BUILT_IN: readonly MediaSource[] = [localFileSource, remoteUrlSource];

const BUILT_IN_IDS: ReadonlySet<SourceId> = new Set(BUILT_IN.map((source) => source.id));

const REGISTRY = new Map<SourceId, MediaSource>(BUILT_IN.map((source) => [source.id, source]));

export function getSource(id: SourceId): MediaSource | undefined {
  return REGISTRY.get(id);
}

/**
 * 注册一个动态来源。同标识重复注册按替换处理——插件更新到新版本时正是这条路径。
 *
 * 内置标识不可被占用：插件自述的插件名恰好叫 `local-file` 时若允许覆盖，
 * 用户全部的本地文件曲目会被路由到该插件去解析。
 */
export function registerSource(source: MediaSource): void {
  if (BUILT_IN_IDS.has(source.id)) {
    throw new Error(`来源标识「${source.id}」是内置来源，不能被动态来源占用。`);
  }
  REGISTRY.set(source.id, source);
}

/**
 * 注销一个动态来源。此后该来源的曲目在 `resolveTrack` 中走 `source-not-registered`
 * 分支——曲目仍留在曲库里，只是不可播放，这正是 plugin-source spec 要的行为。
 */
export function unregisterSource(id: SourceId): void {
  if (BUILT_IN_IDS.has(id)) return;
  REGISTRY.delete(id);
}
