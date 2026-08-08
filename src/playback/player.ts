// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';

import type { PlaybackState, PlayMode } from '@/domain/model/playback';
import type { Track } from '@/domain/model/track';
import { setTrackUnavailable } from '@/domain/repository/track-repository';
import { loadPlayMode, savePlayMode } from '@/domain/settings';
import { buildOrder, step, withRemoved, type PlayOrder } from '@/playback/queue';
import { MediaResolutionError } from '@/sources/contract';
import { resolveTrack } from '@/sources/resolve';

export type PlaybackSnapshot = {
  queue: readonly Track[];
  currentIndex: number;
  currentTrack: Track | null;
  state: PlaybackState;
  positionMs: number;
  durationMs: number;
  playMode: PlayMode;
  /** 最近一次失败的原因，供界面提示；用户操作后清空。 */
  error: string | null;
};

const EMPTY: PlaybackSnapshot = {
  queue: [],
  currentIndex: -1,
  currentTrack: null,
  state: 'idle',
  positionMs: 0,
  durationMs: 0,
  playMode: 'sequential',
  error: null,
};

let snapshot: PlaybackSnapshot = EMPTY;
const listeners = new Set<() => void>();

let player: AudioPlayer | null = null;
let order: PlayOrder = { order: [], position: -1 };
let lockScreenActive = false;
/** 连续解析/播放失败的次数，用于避免整队失效时无限自动跳曲。 */
let consecutiveFailures = 0;
/** 上一次已上报的引擎错误，用于去重（见 onStatus）。 */
let lastReportedError: string | null = null;
/** 每次切歌自增，用于丢弃已过期的异步解析结果。 */
let loadToken = 0;

function publish(patch: Partial<PlaybackSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): PlaybackSnapshot {
  return snapshot;
}

let initialized: Promise<void> | null = null;

/**
 * 初始化播放服务。幂等，重复调用复用同一个 Promise。
 *
 * `interruptionMode: 'doNotMix'` 有两重作用：一是请求独占音频焦点，使其他应用开始
 * 播放时本应用暂停（media-playback spec）；二是 expo-audio 要求锁屏控制必须配合该
 * 模式，否则系统不会把媒体控件关联到本播放器。
 *
 * 来电打断后的恢复由 expo-audio 原生侧处理：它监听 AVAudioSession 的中断通知，
 * 在 `.began` 时暂停、在 `.ended` 且系统给出 `shouldResume` 时恢复；Android 侧对应
 * 音频焦点回调。JS 侧不需要、也不应该再写一份，那会与原生行为打架。
 */
export function initPlayback(): Promise<void> {
  initialized ??= (async () => {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });

    player = createAudioPlayer(null, { updateInterval: 500 });
    player.addListener('playbackStatusUpdate', onStatus);

    publish({ playMode: await loadPlayMode() });
  })().catch((error: unknown) => {
    initialized = null;
    throw error;
  });
  return initialized;
}

function onStatus(status: AudioStatus): void {
  if (status.error) {
    // 状态回调每 500ms 触发一次，而 status.error 要到下一个音源装载成功才会清空。
    // 队列已走到末尾无法再跳曲时，同一个错误会被反复喂进来，因此按错误内容去重。
    if (status.error !== lastReportedError) {
      lastReportedError = status.error;
      reportFailure(`播放失败：${status.error}`);
    }
    return;
  }
  lastReportedError = null;

  publish({
    state: toState(status),
    positionMs: Math.round(status.currentTime * 1000),
    // duration 在加载完成前为 0，此时优先用曲库里已解析出的时长，
    // 进度条不会从「未知总长」跳变成实际值。
    durationMs:
      status.duration > 0
        ? Math.round(status.duration * 1000)
        : (snapshot.currentTrack?.durationMs ?? 0),
  });

  if (status.didJustFinish) void advance(1, true);
}

function toState(status: AudioStatus): PlaybackState {
  if (!status.isLoaded) return snapshot.currentTrack ? 'loading' : 'idle';
  if (status.isBuffering && status.playing) return 'buffering';
  return status.playing ? 'playing' : 'paused';
}

/** 用给定曲目替换整个播放队列并从指定位置开始播放。 */
export async function playQueue(tracks: readonly Track[], startIndex = 0): Promise<void> {
  await initPlayback();

  if (tracks.length === 0) return;

  const index = Math.min(Math.max(startIndex, 0), tracks.length - 1);
  publish({ queue: [...tracks], error: null });
  order = buildOrder(tracks.length, snapshot.playMode, index);
  await load(index, { autoPlay: true });
}

export async function playTrackAt(index: number): Promise<void> {
  if (index < 0 || index >= snapshot.queue.length) return;
  await initPlayback();

  const position = order.order.indexOf(index);
  if (position >= 0) order = { ...order, position };
  await load(index, { autoPlay: true });
}

export async function appendToQueue(tracks: readonly Track[]): Promise<void> {
  if (tracks.length === 0) return;
  await initPlayback();

  const firstNewIndex = snapshot.queue.length;
  const appended = tracks.map((_, offset) => firstNewIndex + offset);
  publish({ queue: [...snapshot.queue, ...tracks] });

  // 保持已排定的播放次序，新曲目接在末尾——随机模式下也不重排，
  // 否则「加入队列」会打乱用户当前正在听的顺序。
  order = { ...order, order: [...order.order, ...appended] };

  if (snapshot.currentIndex === -1) await load(0, { autoPlay: false });
}

/**
 * 从队列移除一首。移除的若是当前曲目，自动切到下一首；队列空了则停止并回到空闲。
 */
export async function removeFromQueue(index: number): Promise<void> {
  if (index < 0 || index >= snapshot.queue.length) return;

  const wasCurrent = index === snapshot.currentIndex;
  const queue = snapshot.queue.filter((_, i) => i !== index);
  order = withRemoved(order, index);

  if (queue.length === 0) {
    player?.pause();
    publish({ queue, currentIndex: -1, currentTrack: null, state: 'idle', positionMs: 0 });
    return;
  }

  const currentIndex =
    snapshot.currentIndex > index ? snapshot.currentIndex - 1 : snapshot.currentIndex;
  publish({ queue, currentIndex });

  if (wasCurrent) {
    const target = order.order[order.position];
    if (target === undefined) {
      player?.pause();
      publish({ currentIndex: -1, currentTrack: null, state: 'idle', positionMs: 0 });
    } else {
      await load(target, { autoPlay: snapshot.state === 'playing' });
    }
  }
}

export function clearQueue(): void {
  player?.pause();
  order = { order: [], position: -1 };
  publish({ queue: [], currentIndex: -1, currentTrack: null, state: 'idle', positionMs: 0 });
}

export async function togglePlayPause(): Promise<void> {
  await initPlayback();
  if (!player || !snapshot.currentTrack) return;

  if (snapshot.state === 'playing' || snapshot.state === 'buffering') {
    player.pause();
  } else {
    player.play();
  }
}

export const next = (): Promise<void> => advance(1, false);
export const previous = (): Promise<void> => advance(-1, false);

async function advance(direction: 1 | -1, auto: boolean): Promise<void> {
  const target = step(order, direction, snapshot.playMode, { auto });

  if (!target) {
    player?.pause();
    publish({ state: 'paused' });
    return;
  }

  order = { ...order, position: target.position };

  // 单曲循环自然播完时目标就是当前曲目，重头播即可，不必重新解析地址
  if (auto && target.index === snapshot.currentIndex && snapshot.playMode === 'loopOne') {
    await player?.seekTo(0);
    player?.play();
    return;
  }

  await load(target.index, { autoPlay: true });
}

export async function seekTo(positionMs: number): Promise<void> {
  if (!player || !snapshot.currentTrack) return;
  await player.seekTo(Math.max(positionMs, 0) / 1000);
  publish({ positionMs });
}

export async function setPlayMode(mode: PlayMode): Promise<void> {
  await savePlayMode(mode);
  publish({ playMode: mode });
  // 重建顺序表：切到随机时重新洗牌并把当前曲目钉在首位，切回顺序时恢复队列原序
  order = buildOrder(snapshot.queue.length, mode, snapshot.currentIndex);
}

export function clearError(): void {
  if (snapshot.error !== null) publish({ error: null });
}

async function load(index: number, { autoPlay }: { autoPlay: boolean }): Promise<void> {
  const track = snapshot.queue[index];
  if (!track || !player) return;

  const token = (loadToken += 1);
  publish({
    currentIndex: index,
    currentTrack: track,
    state: 'loading',
    positionMs: 0,
    error: null,
  });

  try {
    // 每次播放前实时解析地址，不缓存——网盘与插件返回的地址有时效性（决策 4）。
    // 这里是唯一的解析入口，C2 离线缓存将在 resolveTrack 内部拦截。
    const media = await resolveTrack(track);
    if (token !== loadToken) return; // 期间用户又切了歌，丢弃这次结果

    const headers = media.userAgent
      ? { ...media.headers, 'User-Agent': media.userAgent }
      : media.headers;

    player.replace({ uri: media.uri, headers });
    updateLockScreen(track);
    consecutiveFailures = 0;

    if (autoPlay) player.play();
  } catch (error) {
    if (token !== loadToken) return;
    await handleLoadFailure(track, error, autoPlay);
  }
}

/**
 * 单曲失败不中断整个队列（media-playback spec）。
 *
 * 自动播放推进时跳到下一首继续，但以队列长度为上限计数——整个队列都失效时
 * 停下来报错，而不是无限跳曲把电池跑光。
 */
async function handleLoadFailure(
  track: Track,
  error: unknown,
  wasAutoPlay: boolean,
): Promise<void> {
  const message =
    error instanceof MediaResolutionError
      ? error.message
      : `「${track.title}」播放失败：${error instanceof Error ? error.message : '未知错误'}`;

  // 只有「资源确实不在了」才标记失效。网络暂时不可达不标记——否则用户在地铁里
  // 听一次歌，整个远程曲库就被打上失效标记（media-source spec：远程地址失效时
  // 曲目保留在曲库中不被自动删除）。
  if (error instanceof MediaResolutionError && error.marksUnavailable) {
    await setTrackUnavailable(track.id, true);
  }

  consecutiveFailures += 1;
  publish({ error: message, state: 'paused' });

  if (wasAutoPlay && consecutiveFailures < snapshot.queue.length) {
    await advance(1, true);
  } else {
    consecutiveFailures = 0;
    player?.pause();
  }
}

function reportFailure(message: string): void {
  consecutiveFailures += 1;
  publish({ error: message, state: 'paused' });
  if (consecutiveFailures < snapshot.queue.length) void advance(1, true);
  else consecutiveFailures = 0;
}

/**
 * 同步系统媒体会话的展示信息（锁屏与通知栏的标题/艺术家/封面）。
 *
 * 首次调用用 setActiveForLockScreen 把本播放器注册为媒体会话的主体，之后每次切歌
 * 只更新元数据。注意 expo-audio 的媒体会话不提供「上一曲/下一曲」按钮——两端都在
 * 原生侧主动移除了曲目导航命令，详见 design.md 决策 3 记录的已知缺口。
 */
function updateLockScreen(track: Track): void {
  if (!player) return;

  const metadata = {
    title: track.title,
    artist: track.artist ?? '未知艺术家',
    albumTitle: track.album ?? undefined,
    artworkUrl: track.artworkUri ?? undefined,
  };

  if (lockScreenActive) {
    player.updateLockScreenMetadata(metadata);
    return;
  }

  player.setActiveForLockScreen(true, metadata, {
    showSeekForward: true,
    showSeekBackward: true,
  });
  lockScreenActive = true;
}
