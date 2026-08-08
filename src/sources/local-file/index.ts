// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { SOURCE_LOCAL_FILE, type SourceRef, type Track } from '@/domain/model/track';
import { MediaResolutionError, type MediaSource, type ResolvedMedia } from '@/sources/contract';

/** 导入后的本地文件存放目录（仅 iOS 用到，见下方说明）。 */
const LIBRARY_DIR = 'library-audio';

type LocalFileRef = {
  /** 可长期访问的文件 URI。Android 为持久授权的 content://，iOS 为应用沙箱内的 file://。 */
  uri: string;
  fileName: string;
  /** 应用是否拥有该文件本身（iOS 的导入副本）。移除曲目时据此决定是否删除。 */
  managed: boolean;
};

function readRef(track: Track): LocalFileRef {
  const { uri, fileName, managed } = track.sourceRef;
  if (typeof uri !== 'string' || uri.length === 0) {
    throw new MediaResolutionError(
      'invalid-source-ref',
      '曲目记录缺少文件位置信息，无法播放。请移除后重新导入。',
    );
  }
  return {
    uri,
    fileName: typeof fileName === 'string' ? fileName : uri,
    managed: managed === true,
  };
}

export const localFileSource: MediaSource = {
  id: SOURCE_LOCAL_FILE,
  displayName: '本地文件',

  async resolve(track: Track): Promise<ResolvedMedia> {
    const ref = readRef(track);
    const file = new File(ref.uri);

    // media-source spec：源文件已被删除时报告不可播放并说明原因，
    // 而不是把一个失效地址交给播放器去产生一个语焉不详的解码错误。
    if (!file.exists) {
      throw new MediaResolutionError(
        'media-missing',
        `文件「${ref.fileName}」已不在设备上，可能已被删除或移动。`,
        true,
      );
    }

    // 本地文件不需要请求头与 User-Agent——契约允许这两项缺省，
    // 播放器对所有来源用同一段逻辑处理，不判断来源类型。
    return { uri: ref.uri };
  },
};

export type PickedAudioFile = {
  /** 去重键：与 sourceId 组成 music-library spec 要求的唯一标识 */
  sourceKey: string;
  fileName: string;
  size: number | null;
  /** 选中的文件句柄。尚未落到持久位置，需经 `persistPickedFile` 处理。 */
  file: File;
};

/**
 * 打开系统文件选择器挑选音频文件。
 *
 * 用 `expo-file-system` 自带的选择器而非 `expo-document-picker`：能力等价，
 * 但少一个依赖——决策 9 要求每新增一个依赖都核查许可证。
 */
export async function pickAudioFiles(): Promise<PickedAudioFile[]> {
  const picked = await File.pickFileAsync({ multipleFiles: true, mimeTypes: ['audio/*'] });
  if (picked.canceled) return [];

  return picked.result.map((file) => {
    const fileName = file.name;
    const size = file.size ?? null;
    return { sourceKey: buildSourceKey(file, fileName, size), fileName, size, file };
  });
}

/**
 * 两端的去重键取法不同，因为两端拿到的东西根本不是一回事：
 *
 * - Android 走 `ACTION_OPEN_DOCUMENT` 并 `takePersistableUriPermission`，拿到的是
 *   **原文件**的持久 content:// URI。该 URI 本身就是稳定且唯一的身份。
 * - iOS 的 `UIDocumentPickerViewController` 以 `asCopy: true` 打开，拿到的是系统在
 *   临时目录里放的一份**副本**，原文件的位置不对应用暴露。副本路径每次选择都不同，
 *   不能作为身份，因此退而用「文件名 + 字节数」。
 *
 * 代价是 iOS 上两个同名同大小的不同文件会被判为同一首。这个概率低于「每次重新导入
 * 都产生一条重复记录」的代价，后者会让曲库很快变得不可用。
 */
function buildSourceKey(file: File, fileName: string, size: number | null): string {
  return Platform.OS === 'android' ? file.uri : `${fileName}:${size ?? 'unknown'}`;
}

/**
 * 把选中的文件落到能长期访问的位置，返回写入曲目记录的 `sourceRef`。
 *
 * media-source spec 要求「所选文件在设备上的可访问性 MUST 在应用重启后依然有效」。
 * Android 的持久 URI 授权已经满足，原样保存即可，用户设备上只有一份文件；
 * iOS 的临时副本会被系统清理，必须搬进应用的文档目录才算数。
 */
export async function persistPickedFile(picked: PickedAudioFile): Promise<SourceRef> {
  if (Platform.OS === 'android') {
    return { uri: picked.file.uri, fileName: picked.fileName, managed: false };
  }

  const directory = new Directory(Paths.document, LIBRARY_DIR);
  if (!directory.exists) directory.create({ intermediates: true });

  const destination = new File(directory, uniqueFileName(directory, picked.fileName));
  await picked.file.move(destination);
  return { uri: destination.uri, fileName: picked.fileName, managed: true };
}

function uniqueFileName(directory: Directory, fileName: string): string {
  if (!new File(directory, fileName).exists) return fileName;

  const dot = fileName.lastIndexOf('.');
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const extension = dot > 0 ? fileName.slice(dot) : '';
  for (let index = 2; ; index += 1) {
    const candidate = `${stem} (${index})${extension}`;
    if (!new File(directory, candidate).exists) return candidate;
  }
}

/**
 * 曲目从曲库移除时的清理。
 *
 * music-library spec：移除 MUST NOT 删除用户设备上的原始文件。因此只删除应用自己
 * 导入时生成的副本（iOS），Android 侧指向的是用户的原文件，一律不动。
 */
export function discardManagedFile(sourceRef: SourceRef): void {
  if (sourceRef.managed !== true || typeof sourceRef.uri !== 'string') return;
  const file = new File(sourceRef.uri);
  if (file.exists) file.delete();
}
