// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { Directory, File } from 'expo-file-system';

/**
 * 歌词目录：在用户指定的目录里按**曲目标题**找 `.lrc`（design.md 决策 3）。
 *
 * 为什么不是「找音频同目录的同名文件」：文件选择器走的是单文档授权，拿不到兄弟文件；
 * 为什么不按文件名：本地曲目存下来的 `fileName` 实测常是 `msf:19` 这类 MediaStore
 * 文档编号，而远程与插件曲目根本没有文件名。标题是唯一对三类来源都成立的匹配依据。
 */
export type DirectoryLookup =
  | { status: 'found'; content: string }
  | { status: 'not-found' }
  /** 匹配上了但不是 UTF-8 编码——要告诉用户，不能当作没找到（design.md 决策 6）。 */
  | { status: 'unreadable'; fileName: string };

const NOT_FOUND: DirectoryLookup = { status: 'not-found' };

/** 只支持 UTF-8。`fatal` 让非法字节序列直接抛出，而不是替换成 U+FFFD 后交给用户看一屏方块。 */
const UTF8 = new TextDecoder('utf-8', { fatal: true });

export async function findInLyricsDirectory(
  directoryUri: string,
  title: string,
  artist: string | null,
): Promise<DirectoryLookup> {
  const file = locate(directoryUri, candidateNames(title, artist));
  if (!file) return NOT_FOUND;

  let bytes: Uint8Array;
  try {
    bytes = await file.bytes();
  } catch (error) {
    console.warn('[lyrics] 读取歌词文件失败:', error instanceof Error ? error.message : error);
    return NOT_FOUND;
  }

  try {
    return { status: 'found', content: UTF8.decode(bytes) };
  } catch {
    return { status: 'unreadable', fileName: file.name };
  }
}

/**
 * 依次尝试 `<title>.lrc`、`<title> - <artist>.lrc`、`<artist> - <title>.lrc`。
 * 后两种是同名不同版本时的补救写法（design.md Risks），优先级低于裸标题。
 */
function candidateNames(title: string, artist: string | null): string[] {
  const names = [`${title}.lrc`];
  if (artist) names.push(`${title} - ${artist}.lrc`, `${artist} - ${title}.lrc`);
  return names;
}

/**
 * 目录授权可能已经失效（用户删了目录、撤销了授权）——按「未指定目录」同等处理：
 * 跳过这一处来源，不报错（design.md Risks）。
 *
 * 文件名的比较不区分大小写：`.LRC` 与 `.lrc` 是同一种东西，标题里的大小写用户也
 * 未必记得准；这与「不按文件名匹配」不冲突——比较的仍然是标题。
 */
function locate(directoryUri: string, names: readonly string[]): File | null {
  let entries: (Directory | File)[];
  try {
    const directory = new Directory(directoryUri);
    if (!directory.exists) return null;
    entries = directory.list();
  } catch (error) {
    console.warn('[lyrics] 歌词目录不可访问:', error instanceof Error ? error.message : error);
    return null;
  }

  const files = entries.filter((entry): entry is File => entry instanceof File);
  for (const wanted of names.map((name) => name.toLowerCase())) {
    const match = files.find((file) => file.name.toLowerCase() === wanted);
    if (match) return match;
  }
  return null;
}

/**
 * 弹系统目录选择器。取消时返回 null。
 *
 * Android 走 SAF 的目录授权（`ACTION_OPEN_DOCUMENT_TREE` + `takePersistableUriPermission`），
 * 返回的 content:// URI 带持久授权，重启后仍可枚举；iOS 侧的表现留待全量验收。
 *
 * 与 `File.pickFileAsync` 不同，目录选择器把「用户取消」表达为**抛出**（原生侧的
 * `PickerCancelledException`），这里把它收成 null——取消不是错误，什么都不该改。
 */
export async function pickDirectory(): Promise<string | null> {
  try {
    const directory = await Directory.pickDirectoryAsync();
    return directory.uri;
  } catch {
    return null;
  }
}

/**
 * 给用户看的目录名。
 *
 * SAF 的 tree URI 形如 `content://…/tree/primary%3AMusic%2FLyrics`，最后一段解码后是
 * `primary:Music/Lyrics`——已经足够让用户认出是哪个目录，不再做进一步美化。
 */
export function describeDirectory(uri: string): string {
  const last = uri.split('/').filter(Boolean).pop() ?? uri;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
