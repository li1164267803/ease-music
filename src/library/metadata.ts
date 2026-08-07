// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 琥珀音乐 AmberMusic

import { File } from 'expo-file-system';
import { parseBuffer, type IPicture } from 'music-metadata';

export type ParsedMetadata = {
  title: string | null;
  artist: string | null;
  album: string | null;
  durationMs: number | null;
  trackNumber: number | null;
  picture: IPicture | null;
};

/**
 * 先读多少字节尝试解析。spike 2.1 实测 8KB 即可解出标题、封面与时长（时长来自
 * MPEG 首帧的 Xing/Info 头）；取 512KB 是为了容纳偏大的内嵌封面，同时远小于
 * 整文件——批量导入数千首时这个差别就是内存压力的差别。
 */
const HEAD_BYTES = 512 * 1024;

/**
 * 解析音频文件的内嵌元数据。
 *
 * 采用「先读头部，不够再读全文件」两段式：M4A 的 moov 原子可能位于文件末尾，
 * 缺少 Xing 头的 CBR MP3 也要扫完整个文件才能算出准确时长，这两种情况下头部解析
 * 会失败或缺时长，此时才退回整文件读取。
 *
 * 解析失败一律返回 null 而不抛出——music-library spec 要求解析失败时降级到文件名，
 * 且批量导入中单个文件失败不影响其余文件。
 */
export async function parseAudioMetadata(uri: string): Promise<ParsedMetadata | null> {
  const head = await readHead(uri);
  if (head) {
    const parsed = await tryParse(head);
    if (parsed?.durationMs != null) return parsed;
  }

  const whole = await readWhole(uri);
  if (!whole) return null;
  return tryParse(whole);
}

async function tryParse(bytes: Uint8Array): Promise<ParsedMetadata | null> {
  try {
    // 不传 mimeType，让库按字节嗅探容器格式——文件选择器给回的 URI
    // 未必带可靠的扩展名（Android 的 content:// 尤其如此）。
    const { common, format } = await parseBuffer(bytes);
    return {
      title: nonEmpty(common.title),
      artist: nonEmpty(common.artist),
      album: nonEmpty(common.album),
      durationMs: format.duration != null ? Math.round(format.duration * 1000) : null,
      trackNumber: common.track?.no ?? null,
      picture: common.picture?.[0] ?? null,
    };
  } catch {
    return null;
  }
}

async function readHead(uri: string): Promise<Uint8Array | null> {
  try {
    const file = new File(uri);
    if (!file.exists) return null;

    const size = file.size ?? 0;
    if (size > 0 && size <= HEAD_BYTES) return await file.bytes();

    const handle = file.open();
    try {
      return handle.readBytes(HEAD_BYTES);
    } finally {
      handle.close();
    }
  } catch {
    return null;
  }
}

async function readWhole(uri: string): Promise<Uint8Array | null> {
  try {
    const file = new File(uri);
    return file.exists ? await file.bytes() : null;
  } catch {
    return null;
  }
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** 从文件名推断标题：去掉扩展名。元数据缺失时的降级来源。 */
export function titleFromFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  return stem.trim() || fileName;
}
