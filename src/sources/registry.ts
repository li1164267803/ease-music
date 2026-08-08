// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { SourceId } from '@/domain/model/track';
import type { MediaSource } from '@/sources/contract';
import { localFileSource } from '@/sources/local-file';
import { remoteUrlSource } from '@/sources/remote-url';

/**
 * 来源注册表。
 *
 * media-source spec 的扩展约束：新增来源 MUST 能够仅通过实现解析契约与注册来源标识
 * 接入，MUST NOT 要求修改曲库、播放器或 UI 层的既有代码。本文件是唯一需要改动的
 * 地方——C5 网盘与 C6 插件来源届时在这里追加一项即可。
 *
 * 插件来源（C6）在 iOS 构建中会被整体裁剪（决策 7）。届时它以条件注册的形式接入，
 * 注册表缺项时的行为已由 `getSource` 返回 undefined + resolve 报错覆盖，
 * 不需要为裁剪场景写任何特例。
 */
const SOURCES: readonly MediaSource[] = [localFileSource, remoteUrlSource];

const BY_ID = new Map<SourceId, MediaSource>(SOURCES.map((source) => [source.id, source]));

export function getSource(id: SourceId): MediaSource | undefined {
  return BY_ID.get(id);
}
