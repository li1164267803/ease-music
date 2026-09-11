// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import {
  toNewTrack,
  type CandidateTrack,
  type CollectedTracks,
  type SkippedEntry,
} from '@/domain/model/candidate-track';
import { normalizePlaylistName, type Playlist } from '@/domain/model/playlist';
import { SOURCE_LOCAL_FILE, SOURCE_REMOTE_URL, type Track } from '@/domain/model/track';
import {
  addTracksToPlaylist,
  createPlaylist,
  getPlaylist,
} from '@/domain/repository/playlist-repository';
import { addTrack, addTracks, findBySourceKey } from '@/domain/repository/track-repository';
import { cacheArtwork } from '@/library/artwork';
import { decodePlaylistBytes, parsePlaylist, type PlaylistEntry } from '@/library/m3u';
import { parseAudioMetadata, titleFromFileName } from '@/library/metadata';
import {
  discardManagedFile,
  pickAudioFiles,
  pickPlaylistFile,
  persistPickedFile,
  type PickedAudioFile,
} from '@/sources/local-file';
import { buildRemoteSourceRef, inferTitleFromUrl, parseRemoteUrl } from '@/sources/remote-url';

export type ImportSummary = {
  added: Track[];
  /** 已在曲库中、本次未重复入库的数量 */
  duplicates: number;
  /** 逐个文件的失败原因，供界面如实告知用户哪些没进来 */
  failures: { name: string; reason: string }[];
};

const EMPTY_SUMMARY: ImportSummary = { added: [], duplicates: 0, failures: [] };

/**
 * 本地文件导入：选择文件 → 解析元数据 → 提取封面 → 入库。
 *
 * 逐个文件独立处理并各自捕获异常——music-library spec 要求批量导入中单个文件的
 * 失败不影响其余文件。
 */
export async function importLocalFiles(): Promise<ImportSummary> {
  const picked = await pickAudioFiles();
  if (picked.length === 0) return EMPTY_SUMMARY;

  const summary: ImportSummary = { added: [], duplicates: 0, failures: [] };

  for (const file of picked) {
    try {
      const result = await importOne(file);
      if (result === 'duplicate') summary.duplicates += 1;
      else summary.added.push(result);
    } catch (error) {
      // 失败原因既要报给用户，也要留在日志里——批量导入时用户只看得到汇总。
      console.warn(
        '[import] 单文件失败:',
        file.fileName,
        error instanceof Error ? error.message : error,
      );
      summary.failures.push({
        name: file.fileName,
        reason: error instanceof Error ? error.message : '未知错误',
      });
    }
  }

  return summary;
}

async function importOne(picked: PickedAudioFile): Promise<Track | 'duplicate'> {
  // 去重在落盘之前完成：iOS 上文件已经是系统给的临时副本，确认重复后直接丢弃，
  // 不必先搬进文档目录再发现是白搬一趟。
  const existing = await findBySourceKey(SOURCE_LOCAL_FILE, picked.sourceKey);
  if (existing) return 'duplicate';

  const sourceRef = await persistPickedFile(picked);
  try {
    const uri = sourceRef.uri as string;
    const metadata = await parseAudioMetadata(uri);
    const artworkUri = metadata?.picture ? await cacheArtwork(metadata.picture) : null;

    const { track } = await addTrack({
      sourceId: SOURCE_LOCAL_FILE,
      sourceKey: picked.sourceKey,
      sourceRef,
      // 元数据缺失或解析失败时回退到文件名，艺术家与专辑留空由界面显示「未知」
      title: metadata?.title ?? titleFromFileName(picked.fileName),
      artist: metadata?.artist ?? null,
      album: metadata?.album ?? null,
      durationMs: metadata?.durationMs ?? null,
      trackNumber: metadata?.trackNumber ?? null,
      artworkUri,
    });
    return track;
  } catch (error) {
    // 入库失败时把已经搬进来的副本清掉，避免文档目录里堆积没有曲目记录指向的孤儿文件
    discardManagedFile(sourceRef);
    throw error;
  }
}

export type RemoteImportResult =
  { ok: true; track: Track; duplicate: boolean } | { ok: false; reason: string };

/**
 * 远程 URL 导入。
 *
 * 不读取远端文件头来获取标签——是否发起 Range 请求取远端元数据与 115 网盘是同一个
 * 问题，design.md 已记录留待 C5 一并决策。当前按 spec 允许的方式从 URL 推断标题。
 */
export async function importRemoteUrl(input: string): Promise<RemoteImportResult> {
  const parsed = parseRemoteUrl(input);
  if (!parsed) {
    // 非法输入在加入曲库前就被拒绝，不创建曲目记录（media-source spec）
    return { ok: false, reason: '请输入以 http:// 或 https:// 开头的有效音频地址。' };
  }

  const { track, created } = await addTrack({
    sourceId: SOURCE_REMOTE_URL,
    sourceKey: parsed.sourceKey,
    sourceRef: buildRemoteSourceRef(parsed.url),
    title: inferTitleFromUrl(parsed.url),
    artist: null,
    album: null,
    durationMs: null,
    trackNumber: null,
    artworkUri: null,
  });

  return { ok: true, track, duplicate: !created };
}

/**
 * 候选曲目入库。
 *
 * 不解析音频文件的内嵌标签——曲目信息由来源直接提供（music-library spec「曲目元数据」
 * 的第二条途径）。除此之外与其他入库路径走的是同一个 `addTrack`：同样的去重、同样的
 * 记录形态，因此入库后它与本地文件曲目在曲库、歌单、检索、播放里完全同权。
 */
export async function addCandidateTrack(
  candidate: CandidateTrack,
): Promise<{ track: Track; duplicate: boolean }> {
  const { track, created } = await addTrack(toNewTrack(candidate));
  return { track, duplicate: !created };
}

/** 批量入库的去处：新建歌单，或追加到既有歌单。 */
export type ImportTarget = { kind: 'new'; name: string } | { kind: 'existing'; playlistId: string };

export type ImportCandidatesResult =
  | {
      ok: true;
      playlist: Playlist;
      /** 本次新增入库的数量 */
      added: number;
      /** 原已在曲库中、本次未重复入库的数量 */
      duplicates: number;
      /** 实际进入歌单的数量：既有歌单里已有的曲目不重复加入 */
      addedToPlaylist: number;
    }
  | { ok: false; reason: string };

/**
 * 候选曲目批量入库并放进歌单（add-plugin-discovery-import/design.md 决策 3）。
 *
 * 顺序：先校验目标，再入库，最后建歌单与关联。目标不成立时什么都不发生
 * （plugin-discovery spec「空歌单名」）；入库在一个事务里，失败整批回滚。
 * 产物是一个普通歌单：不记录来源，也不依赖任何插件（spec「导入的歌单是普通本地歌单」）。
 */
export async function importCandidates(
  candidates: CandidateTrack[],
  target: ImportTarget,
): Promise<ImportCandidatesResult> {
  const existing = target.kind === 'existing' ? await getPlaylist(target.playlistId) : null;
  if (target.kind === 'existing' && !existing) return { ok: false, reason: '目标歌单已不存在。' };
  if (target.kind === 'new' && !normalizePlaylistName(target.name)) {
    return { ok: false, reason: '歌单名称不能为空。' };
  }

  const results = await addTracks(candidates.map(toNewTrack));
  const playlist = target.kind === 'new' ? await createPlaylist(target.name) : existing;
  // 两个分支都已在上面校验过，这里只是类型收窄
  if (!playlist) return { ok: false, reason: '目标歌单已不存在。' };

  const addedToPlaylist = await addTracksToPlaylist(
    playlist.id,
    results.map((result) => result.track.id),
  );
  const added = results.filter((result) => result.created).length;
  return { ok: true, playlist, added, duplicates: results.length - added, addedToPlaylist };
}

/**
 * 播放列表取回的体积上限。一个上万条的 m3u 也不到 1 MB，2 MiB 已经足够宽松；
 * 设这个上限是为了挡住「地址其实指向一个几百兆的文件」这种情形——那会在读进内存
 * 的一瞬间把应用拖垮，且此时用户根本还没看到任何提示。
 */
const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;

/**
 * 播放列表解析完、尚未入库的状态。
 *
 * 取回与解析在弹层打开**之前**完成：新建歌单的默认名要从播放列表自身得出（任务 3.6），
 * 而本地文件的名字要等用户选完才知道。
 */
export type PreparedPlaylist =
  | { status: 'ready'; collected: CollectedTracks; defaultName: string }
  /** 用户在文件选择器里取消了，不是失败，界面不该报错。 */
  | { status: 'canceled' }
  | { status: 'failed'; reason: string };

/** 从设备上选一个播放列表文件并解析。 */
export async function preparePlaylistFromFile(): Promise<PreparedPlaylist> {
  const picked = await pickPlaylistFile();
  if (!picked) return { status: 'canceled' };

  if (picked.size !== null && picked.size > MAX_PLAYLIST_BYTES) {
    return { status: 'failed', reason: describeTooLarge(picked.size) };
  }

  let bytes: Uint8Array;
  try {
    bytes = await picked.read();
  } catch (error) {
    return { status: 'failed', reason: `读取文件失败：${describeError(error)}` };
  }
  if (bytes.byteLength > MAX_PLAYLIST_BYTES) {
    return { status: 'failed', reason: describeTooLarge(bytes.byteLength) };
  }

  // 以文件自身的位置为基准：本地播放列表里的相对路径会因此解析成 file:// 或
  // content:// 地址，被解析器判为不可用条目并说明应改走本地文件导入（design 决策 3）。
  return finishPlaylist(bytes, safeBaseUrl(picked.uri), titleFromFileName(picked.fileName));
}

/** 取回一个远程播放列表并解析。 */
export async function preparePlaylistFromUrl(input: string): Promise<PreparedPlaylist> {
  const parsed = parseRemoteUrl(input);
  if (!parsed) {
    // 与单条地址导入同一条规则：非法输入在发起请求前就被拒绝。
    return { status: 'failed', reason: '请输入以 http:// 或 https:// 开头的播放列表地址。' };
  }

  let response: Response;
  try {
    response = await fetch(parsed.url.toString());
  } catch (error) {
    return { status: 'failed', reason: `取回失败：${describeError(error)}` };
  }
  if (!response.ok) {
    return { status: 'failed', reason: `取回失败：服务器返回 HTTP ${response.status}。` };
  }

  // 先看声明的长度：能在下载之前就拒掉的，不必先读进内存再后悔。
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_PLAYLIST_BYTES) {
    return { status: 'failed', reason: describeTooLarge(declared) };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return { status: 'failed', reason: `取回失败：${describeError(error)}` };
  }
  // 没有 content-length 的响应只能读完再判。
  if (bytes.byteLength > MAX_PLAYLIST_BYTES) {
    return { status: 'failed', reason: describeTooLarge(bytes.byteLength) };
  }

  // 基准取重定向后的最终地址——相对地址是相对于文件实际所在的位置，不是用户输入的那个。
  const base = safeBaseUrl(response.url) ?? parsed.url;
  return finishPlaylist(bytes, base, inferTitleFromUrl(parsed.url));
}

function finishPlaylist(
  bytes: Uint8Array,
  base: URL | null,
  defaultName: string,
): PreparedPlaylist {
  const parsed = parsePlaylist(decodePlaylistBytes(bytes), base);
  if (parsed.kind === 'hls') {
    // 文案必须说清是「流媒体播放列表」而不是笼统的「格式不支持」：`.m3u8` 承载两种
    // 语义完全不同的东西，用户否则无从知道自己的文件到底哪里不对（design Risks）。
    return {
      status: 'failed',
      reason:
        '这是一个流媒体播放列表（HLS），里面是同一条直播流的分片而不是一首首曲目，暂不支持导入。',
    };
  }

  if (parsed.entries.length === 0) {
    // 零条目不进入入库流程，也不创建空歌单（spec「全部条目不可用」）。
    return {
      status: 'failed',
      reason:
        parsed.skipped.length === 0
          ? '这个文件里没有可识别的条目，不是可用的播放列表。'
          : `这个播放列表里的 ${parsed.skipped.length} 个条目都无法入库：${summarizeSkipped(parsed.skipped)}。`,
    };
  }

  return {
    status: 'ready',
    defaultName,
    collected: {
      items: parsed.entries.map(toPlaylistCandidate),
      // 播放列表是一次读完的，不存在取页触顶。
      truncated: false,
      skipped: parsed.skipped.length > 0 ? parsed.skipped : undefined,
    },
  };
}

/**
 * 播放列表条目 → 候选曲目。
 *
 * `sourceId` 是既有的远程 URL 来源而非一个新来源（design 决策 1）：解析方式与用户
 * 手输一条地址逐字相同，而去重键是 `sourceId + sourceKey`——另起一个来源会让同一个
 * 地址经两条路进来被判成两首歌。
 */
function toPlaylistCandidate(entry: PlaylistEntry): CandidateTrack {
  return {
    sourceId: SOURCE_REMOTE_URL,
    sourceKey: entry.url.toString(),
    sourceRef: buildRemoteSourceRef(entry.url),
    title: entry.title,
    artist: entry.artist,
    // 播放列表文件只自述艺人、标题与时长，其余一律留空，不去猜。
    album: null,
    durationMs: entry.durationMs,
    trackNumber: null,
    artworkUri: null,
  };
}

/** 把跳过项按原因归并，供界面用一句话说清「为什么没进来」。 */
export function summarizeSkipped(skipped: SkippedEntry[]): string {
  const counts = new Map<string, number>();
  for (const entry of skipped) counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  return [...counts].map(([reason, count]) => `${count} 条${reason}`).join('，');
}

function safeBaseUrl(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    // 基准解析不出来不是致命错误：绝对地址照常入库，相对地址落入不可用条目。
    return null;
  }
}

function describeTooLarge(bytes: number): string {
  return `这个播放列表有 ${Math.round(bytes / 1024)} KB，超过了 ${MAX_PLAYLIST_BYTES / 1024 / 1024} MB 的上限，没有读取。`;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}
