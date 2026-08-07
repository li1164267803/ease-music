// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 琥珀音乐 AmberMusic

import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { IPicture } from 'music-metadata';

const ARTWORK_DIR = 'artwork';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

/**
 * 把内嵌封面落成文件并返回其 URI。
 *
 * music-library spec 要求同一封面不得在每次展示时重复解析，因此封面在导入时提取
 * 一次、写成文件，曲目记录里只存 URI，界面直接按 URI 加载。
 *
 * 文件名取封面数据的 SHA-256：同一张专辑的十几首曲目内嵌的是同一张图，按内容
 * 寻址后只落一份，且第二首起连写入都省掉。
 */
export async function cacheArtwork(picture: IPicture): Promise<string | null> {
  try {
    const bytes = toUint8Array(picture.data);
    if (bytes.length === 0) return null;

    const directory = new Directory(Paths.document, ARTWORK_DIR);
    if (!directory.exists) directory.create({ intermediates: true });

    const hash = await sha256Hex(bytes);
    const extension = EXTENSIONS[picture.format.toLowerCase()] ?? 'img';
    const file = new File(directory, `${hash}.${extension}`);

    if (!file.exists) {
      file.create();
      file.write(bytes);
    }
    return file.uri;
  } catch {
    // 封面写入失败不该让整首曲目导入不进来，界面会显示统一占位图。
    return null;
  }
}

/**
 * 统一成后端 ArrayBuffer 的 Uint8Array。`expo-crypto` 的 digest 只接受 `BufferSource`，
 * 而 music-metadata 的图片数据在类型上允许 SharedArrayBuffer 后端，两者不兼容——
 * 复制一份是最直接的收敛方式，封面数据只有几十到几百 KB，代价可忽略。
 */
function toUint8Array(data: IPicture['data']): Uint8Array<ArrayBuffer> {
  const source = data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = new Uint8Array(new ArrayBuffer(source.byteLength));
  copy.set(source);
  return copy;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const buffer = await digest(CryptoDigestAlgorithm.SHA256, bytes);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 清理不再被任何曲目引用的封面文件。
 *
 * 封面按内容寻址、被多首曲目共享，因此不能在删除单首曲目时顺手删掉它的封面文件。
 * 由调用方传入当前仍在使用的 URI 集合，一次性清掉孤儿文件。
 */
export function pruneArtwork(inUse: ReadonlySet<string>): void {
  const directory = new Directory(Paths.document, ARTWORK_DIR);
  if (!directory.exists) return;

  for (const entry of directory.list()) {
    if (entry instanceof File && !inUse.has(entry.uri)) entry.delete();
  }
}
