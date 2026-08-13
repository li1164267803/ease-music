// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { sniffAudioExtension } from '@/domain/audio-format';

/**
 * 缓存音频的落盘位置。
 *
 * 目录落在 `Paths.document` 而**不是** `Paths.cache`：后者是系统在存储紧张时可以自行
 * 清空的目录，而 offline-cache spec 要求「已下载的内容一直保留，直到用户显式删除」。
 * 名字里有 cache，语义上却必须是用户资产。
 */
const CACHE_DIR = 'cache-audio';

/**
 * 未完成的下载先落在这里（design.md 决策 3）。
 *
 * Android 的下载失败会把已写入的部分留在目标位置（`expo-file-system` 官方行为），
 * 直接下到最终路径就会留下一个「看起来已下载」的坏文件。先落这里、成功后再移动，
 * 唯一可能的残留就只出现在这个目录里，启动时整个清空即可。
 */
const PARTIAL_DIR = '.partial';

function ensure(directory: Directory): Directory {
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/** 已完成的缓存文件目录。按需创建——迁移只管数据库，目录由第一次使用时建出来。 */
function cacheDirectory(): Directory {
  return ensure(new Directory(Paths.document, CACHE_DIR));
}

function partialDirectory(): Directory {
  return ensure(new Directory(Paths.document, CACHE_DIR, PARTIAL_DIR));
}

/**
 * 下载过程中的临时文件。文件名只用 `track.id`——它此刻还没有扩展名，
 * 扩展名要等内容到手才推断得出来。
 */
export function partialFileFor(trackId: string): File {
  return new File(partialDirectory(), trackId);
}

/**
 * 缓存文件的最终位置：`<track.id>.<ext>`（design.md 决策 2）。
 *
 * 不按内容哈希命名——封面用哈希是因为同专辑的多首曲目共享同一张图，音频不共享，
 * 哈希只会带来「必须下完才知道文件叫什么」。一首曲目对一份缓存，`track.id` 天然是键。
 */
export function cacheFileFor(trackId: string, extension: string): File {
  return new File(cacheDirectory(), `${trackId}.${extension}`);
}

export function cachedFileExists(uri: string): boolean {
  return new File(uri).exists;
}

export function deleteCacheFile(uri: string): void {
  const file = new File(uri);
  if (file.exists) file.delete();
}

/**
 * 清空未完成的下载（决策 8：`.partial` 残留）。
 *
 * 能出现在这个目录里的文件，一定属于某次没跑完的下载——进行中的状态只存在内存里，
 * 进程一死就没有任何东西还认得它们。
 */
export function clearPartialFiles(): void {
  const directory = new Directory(Paths.document, CACHE_DIR, PARTIAL_DIR);
  if (!directory.exists) return;
  for (const entry of directory.list()) entry.delete();
}

/**
 * 删除不在缓存记录中的孤儿文件（决策 8：文件有、记录无）。
 *
 * 形态与 `src/library/artwork.ts` 的 `pruneArtwork` 一致：由调用方给出仍在使用的
 * URI 集合，遍历目录删掉不在集合里的。`.partial` 是子目录、不是 `File`，自然被跳过。
 */
export function pruneCacheFiles(inUse: ReadonlySet<string>): void {
  const directory = new Directory(Paths.document, CACHE_DIR);
  if (!directory.exists) return;

  for (const entry of directory.list()) {
    if (entry instanceof File && !inUse.has(entry.uri)) entry.delete();
  }
}

/**
 * 推断缓存文件的扩展名。
 *
 * 先看文件内容的魔数，再退回地址里的后缀，都认不出时用 `bin`。
 *
 * 设计阶段原本打算读响应的 `Content-Type`，但 `expo-file-system` 的下载任务不把响应头
 * 交给 JS 侧，拿不到。改读文件头反而更可靠——插件音源指向的 CDN 大多一律返回
 * `application/octet-stream`，而文件头是内容自己说的。魔数判断与曲库元数据解析共用
 * 同一份实现（`@/domain/audio-format`）。
 *
 * 保留扩展名是低成本的保险：播放引擎在缺少 MIME 提示时会退回按扩展名判断容器格式。
 */
export function inferExtension(url: string, file: File): string {
  return extensionFromContent(file) ?? extensionFromUrl(url) ?? 'bin';
}

function extensionFromContent(file: File): string | null {
  let handle: ReturnType<File['open']> | null = null;
  try {
    handle = file.open(FileMode.ReadOnly);
    return sniffAudioExtension(handle.readBytes(12));
  } catch {
    return null;
  } finally {
    handle?.close();
  }
}

/** 只接受已知的音频后缀——地址末段是 `.php` 或一串 id 时，猜出来的扩展名比没有更糟。 */
const URL_EXTENSIONS: ReadonlySet<string> = new Set([
  'mp3',
  'flac',
  'm4a',
  'aac',
  'ogg',
  'opus',
  'wav',
  'wma',
  'ape',
  'aiff',
  'mp4',
]);

function extensionFromUrl(url: string): string | null {
  const path = url.split(/[?#]/)[0] ?? '';
  const last = path.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  if (dot <= 0) return null;

  const extension = last.slice(dot + 1).toLowerCase();
  return URL_EXTENSIONS.has(extension) ? extension : null;
}
