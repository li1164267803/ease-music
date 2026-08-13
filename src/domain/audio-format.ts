// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

/**
 * 按文件头的魔数判断音频容器格式，返回不带点的扩展名。
 *
 * 放在领域层是因为**两处都要用，而它们分属不同层**：曲库的元数据解析（能力层）用它
 * 挑 `music-metadata` 的解析器，离线缓存的落盘（来源层之下）用它给缓存文件定扩展名。
 * 让其中一方引用另一方都会造成反向依赖，因此下沉到两者都能向下依赖的位置。
 *
 * 对元数据解析而言这不是可有可无的优化，是绕过一个真实缺陷：`music-metadata` 自带的
 * 内容嗅探走 `findLoaderForContentType`，依赖 `content-type` 与 `media-typer` 解析 MIME
 * 串；该路径在 Node 下正常，在 Hermes 上失败，报 `Guessed MIME-type not supported:
 * audio/mpeg`——所有本地文件的元数据会因此全部解析不出来。改走扩展名（纯字符串比较，
 * 不碰那两个库）即可正常解析。
 *
 * 也比依赖文件名更可靠：Android SAF 给回的 content:// URI 根本没有扩展名，插件解析出的
 * 地址则常常带一长串查询参数。
 */
export function sniffAudioExtension(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));

  if (ascii(0, 3) === 'ID3') return 'mp3';
  // MPEG 帧同步：11 个连续的 1
  if (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) return 'mp3';
  if (ascii(0, 4) === 'fLaC') return 'flac';
  // ISO 基础媒体容器：前四字节是 box 长度，紧跟 ftyp
  if (ascii(4, 4) === 'ftyp') return 'm4a';
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'wav';
  if (ascii(0, 4) === 'FORM' && ascii(8, 4).startsWith('AIF')) return 'aiff';
  if (ascii(0, 4) === 'MAC ') return 'ape';
  // ASF/WMA 的 GUID 头
  if (bytes[0] === 0x30 && bytes[1] === 0x26 && bytes[2] === 0xb2 && bytes[3] === 0x75) {
    return 'wma';
  }
  return null;
}
