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

/**
 * 按魔数判断容器格式，返回 `music-metadata` 认得的扩展名。
 *
 * **这不是可有可无的优化，是绕过一个真实缺陷。** `music-metadata` 自带的内容嗅探
 * 走 `findLoaderForContentType`，它依赖 `content-type` 与 `media-typer` 解析 MIME 串；
 * 该路径在 Node 下正常，但在 Hermes 上失败，报 `Guessed MIME-type not supported:
 * audio/mpeg`——所有本地文件的元数据因此全部解析不出来。真机实测二分确认：改走
 * `findLoaderForExtension`（纯字符串比较，不碰那两个库）即可正常解析。
 *
 * 顺带也比依赖文件名更可靠：Android SAF 给回的 content:// URI 根本没有扩展名。
 */
function sniffExtension(bytes: Uint8Array): string | null {
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));

  if (bytes.length < 12) return null;

  if (ascii(0, 3) === 'ID3') return '.mp3';
  // MPEG 帧同步：11 个连续的 1
  if (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) return '.mp3';
  if (ascii(0, 4) === 'fLaC') return '.flac';
  if (ascii(4, 4) === 'ftyp') return '.m4a';
  if (ascii(0, 4) === 'OggS') return '.ogg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return '.wav';
  if (ascii(0, 4) === 'FORM' && ascii(8, 4).startsWith('AIF')) return '.aiff';
  if (ascii(0, 4) === 'MAC ') return '.ape';
  // ASF/WMA 的 GUID 头
  if (bytes[0] === 0x30 && bytes[1] === 0x26 && bytes[2] === 0xb2 && bytes[3] === 0x75) {
    return '.wma';
  }
  return null;
}

async function tryParse(bytes: Uint8Array): Promise<ParsedMetadata | null> {
  try {
    const extension = sniffExtension(bytes);
    if (!extension) {
      // 认不出的格式不再交给库去猜——那条路在 Hermes 上必然失败，
      // 白等一次异常不如直接降级到文件名。
      return null;
    }

    const { common, format } = await parseBuffer(bytes, { path: `audio${extension}` });
    return {
      title: nonEmpty(common.title),
      artist: nonEmpty(common.artist),
      album: nonEmpty(common.album),
      durationMs: format.duration != null ? Math.round(format.duration * 1000) : null,
      trackNumber: common.track?.no ?? null,
      picture: common.picture?.[0] ?? null,
    };
  } catch (error) {
    // 解析失败是预期路径（会降级到文件名），但静默吞掉会让线上问题无从查起。
    console.warn('[metadata] 解析失败:', error instanceof Error ? error.message : error);
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
  } catch (error) {
    console.warn('[metadata] 读取文件头失败:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function readWhole(uri: string): Promise<Uint8Array | null> {
  try {
    const file = new File(uri);
    return file.exists ? await file.bytes() : null;
  } catch (error) {
    console.warn('[metadata] 读取整文件失败:', error instanceof Error ? error.message : error);
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
