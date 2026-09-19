// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { fetch } from 'expo/fetch';

import type { PlaybackState, PlayMode } from '@/domain/model/playback';
import type { Track } from '@/domain/model/track';
import { setTrackUnavailable } from '@/domain/repository/track-repository';
import { loadPlayMode, savePlayMode } from '@/domain/settings';
import { recordPlay } from '@/history/repository';
import { notifyHistoryChanged } from '@/history/store';
import {
  buildOrder,
  step,
  withRemoved,
  type AdvanceReason,
  type PlayOrder,
} from '@/playback/queue';
import { MediaResolutionError } from '@/sources/contract';
import { resolveTrack } from '@/sources/resolve';

/**
 * 一次播放失败的记录（fix-playback-failure-handling/design.md 决策 3）。
 *
 * 归属于失败的那首曲目，而不是「最近一次装载」：自动跳到下一首之后它仍然在，
 * 直到用户关闭、被新的失败覆盖、这首曲目之后成功发声，或队列清空。
 */
export type PlaybackFailure = {
  trackId: string;
  /** 面向用户的完整说明，含曲目标题 */
  message: string;
};

export type PlaybackSnapshot = {
  queue: readonly Track[];
  currentIndex: number;
  currentTrack: Track | null;
  state: PlaybackState;
  positionMs: number;
  durationMs: number;
  playMode: PlayMode;
  /**
   * 用户想不想播（决策 5）。播放/暂停按钮只读它，不读 `state`——加载与缓冲时引擎不在
   * 发声，但用户的意图仍是播放，按钮不该显示成「已暂停」。
   */
  playWhenReady: boolean;
  failure: PlaybackFailure | null;
};

const EMPTY: PlaybackSnapshot = {
  queue: [],
  currentIndex: -1,
  currentTrack: null,
  state: 'idle',
  positionMs: 0,
  durationMs: 0,
  playMode: 'sequential',
  playWhenReady: false,
  failure: null,
};

let snapshot: PlaybackSnapshot = EMPTY;
const listeners = new Set<() => void>();

let player: AudioPlayer | null = null;
let order: PlayOrder = { order: [], position: -1 };
let lockScreenActive = false;
/**
 * 本轮连续失败过的曲目。任一曲目成功发声即清空，达到上限时停止自动跳过（决策 4）。
 *
 * 记的是曲目而不是失败次数：列表循环或随机模式下跳过会绕回来，队列只有一首时更是
 * 原地打转，按次数数会把同一首重试到上限，还报成「连续 N 首」。跳过的目标已经在这里，
 * 说明队列里能试的都试过了，立即停下（fix-ios-acceptance-issues/design.md 决策 3）。
 *
 * 上限是固定常量而不是队列长度：连续失败说明问题不在单首曲目（来源下线、断网），
 * 一千多首的歌单被逐首尝试一遍，只会空耗网络请求并一直占着界面。
 */
const failedInStreak = new Set<string>();
const MAX_CONSECUTIVE_FAILURES = 5;
/**
 * 失败后跳过的方向：沿用触发这次装载的导航方向（决策 2）。
 *
 * 用户点「上一曲」切到一首失败曲目，跳过是在替用户继续往前走，而不是弹回原曲。
 * 曲目一旦成功发声，那次导航就结束了，之后播放中途出错按正常的播放方向往后跳。
 */
let skipDirection: 1 | -1 = 1;
/** 每次切歌（或停止）自增，用于丢弃已过期的异步解析结果。 */
let loadToken = 0;
/** 已经发过声的那次装载，见 `markSounding`。 */
let soundedToken = -1;
/**
 * 引擎里装着的音源属于哪一次装载，并记下它的地址供出错后诊断（决策 5、6）。
 *
 * 与 `loadToken` 不等时，引擎里装的不是当前曲目——新曲目还在解析、装载失败后停下，
 * 或音源已经出错作废。那段时间引擎的状态回报与界面上的曲目无关，一律丢弃。
 */
let engineSource: { token: number; uri: string; headers?: Record<string, string> } | null = null;
/**
 * 正在等待引擎跟进的 seek 目标。
 *
 * 引擎完成跳转要一小段时间，这期间 500ms 一次的状态回调报的仍是跳转前的位置。
 * 不挡掉的话，进度条会先弹回原处、再跳到目标，表现为点一下来回闪。
 *
 * `until` 是兜底：seek 万一没生效（例如曲目还在装载），到点就放弃遮挡、让位置跳回
 * 引擎的真实回报——进度条永久停在一个假位置比闪一下更糟。
 */
let pendingSeek: { positionMs: number; until: number } | null = null;

/** 认为引擎已追上目标的容差。状态回调间隔 500ms，播放中一拍的位移就是这个量级。 */
const SEEK_SETTLE_TOLERANCE_MS = 800;
/** 遮挡的最长时间，超过就认为这次 seek 没落地。 */
const SEEK_SETTLE_TIMEOUT_MS = 1500;
/** 引擎出错后诊断请求的超时。超时按「无法连接」报告。 */
const PROBE_TIMEOUT_MS = 8000;
/** 装载多久还没就绪，就去问服务端这个地址的情况（见 `checkSlowLoad`）。 */
const SLOW_LOAD_CHECK_MS = 10_000;

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
  const track = snapshot.currentTrack;
  if (!engineSource || engineSource.token !== loadToken || !track) return;

  if (status.error) {
    // 出错的音源就此作废：status.error 要到下一个音源装载成功才会清空，之后每 500ms
    // 的回报都会重复它，作废后由上面的守卫挡掉；用户再按播放时也会重新装载。
    const { uri, headers } = engineSource;
    engineSource = null;
    if (/^https?:/i.test(uri)) {
      void failTrack(track, '正在检查原因…', diagnose(uri, headers));
    } else {
      void failTrack(track, UNDECODABLE);
    }
    return;
  }

  const reportedMs = Math.round(status.currentTime * 1000);
  let positionMs = reportedMs;

  if (pendingSeek) {
    const caughtUp = Math.abs(reportedMs - pendingSeek.positionMs) <= SEEK_SETTLE_TOLERANCE_MS;
    if (caughtUp || Date.now() > pendingSeek.until) pendingSeek = null;
    else positionMs = pendingSeek.positionMs;
  }

  const state = toState(status);
  publish({
    state,
    positionMs,
    // duration 在加载完成前为 0，此时优先用曲库里已解析出的时长，
    // 进度条不会从「未知总长」跳变成实际值。
    durationMs: status.duration > 0 ? Math.round(status.duration * 1000) : (track.durationMs ?? 0),
    // 音源已归属当前曲目时，锁屏、耳机或音频焦点导致的暂停经由这里回到界面。只认 ready：
    // expo-audio 在 idle / buffering 时回报的 playing 是上一次 isPlaying 变化留下的旧值，
    // play() 不会更新它（上一首刚播完时恒为 false），拿来同步会冲掉「装好就播」的意图。
    ...(status.playbackState === 'ready' ? { playWhenReady: status.playing } : null),
  });

  if (state === 'playing') markSounding(track);
  if (status.didJustFinish) void advance(1, 'finished');
}

function toState(status: AudioStatus): PlaybackState {
  // 「加载」持续到曲目首次就绪（spec：尚未开始发声），之后的缓冲才是「缓冲」。
  // Android 上 isLoaded 只在 ready / ended 为真，不能用它与 isBuffering 组合判断。
  if (status.isBuffering) return snapshot.state === 'loading' ? 'loading' : 'buffering';
  if (!status.isLoaded) return 'loading';
  return status.playing ? 'playing' : 'paused';
}

/**
 * 曲目确实发出了声音：连续失败到此为止，关于这首曲目的失败提示也不再成立，并记一次播放。
 *
 * 状态回报每 500ms 一拍，这里只在每次装载第一次发声时生效：一次装载就是一次播放，
 * 暂停后继续不算新的一次。
 */
function markSounding(track: Track): void {
  if (soundedToken === loadToken) return;
  soundedToken = loadToken;

  failedInStreak.clear();
  skipDirection = 1;
  if (snapshot.failure?.trackId === track.id) publish({ failure: null });
  rememberPlayed(track);
}

/** 用给定曲目替换整个播放队列并从指定位置开始播放。 */
export async function playQueue(tracks: readonly Track[], startIndex = 0): Promise<void> {
  await initPlayback();

  if (tracks.length === 0) return;

  const index = Math.min(Math.max(startIndex, 0), tracks.length - 1);
  publish({ queue: [...tracks] });
  order = buildOrder(tracks.length, snapshot.playMode, index);
  await load(index, { autoPlay: true, direction: 1 });
}

export async function playTrackAt(index: number): Promise<void> {
  if (index < 0 || index >= snapshot.queue.length) return;
  await initPlayback();

  const position = order.order.indexOf(index);
  if (position >= 0) order = { ...order, position };
  await load(index, { autoPlay: true, direction: 1 });
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

  if (snapshot.currentIndex === -1) await load(0, { autoPlay: false, direction: 1 });
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
    clearQueue();
    return;
  }

  const currentIndex =
    snapshot.currentIndex > index ? snapshot.currentIndex - 1 : snapshot.currentIndex;
  publish({ queue, currentIndex });

  if (wasCurrent) {
    const target = order.order[order.position];
    if (target === undefined) stop();
    else await load(target, { autoPlay: snapshot.playWhenReady, direction: 1 });
  }
}

/**
 * 清空队列。没有了当前曲目，系统媒体控件与失败提示所指的曲目也就不在任何播放入口中，
 * 一并撤下（决策 3、7）。下一次装载会重新注册锁屏控件。
 */
export function clearQueue(): void {
  order = { order: [], position: -1 };
  stop();
  player?.clearLockScreenControls();
  lockScreenActive = false;
  publish({ queue: [], failure: null });
}

/** 回到没有当前曲目的空闲状态，并作废仍在进行的装载——否则它解析完会把已移除的曲目装回引擎。 */
function stop(): void {
  loadToken += 1;
  engineSource = null;
  pendingSeek = null;
  player?.pause();
  publish({
    currentIndex: -1,
    currentTrack: null,
    state: 'idle',
    positionMs: 0,
    durationMs: 0,
    playWhenReady: false,
  });
}

export async function togglePlayPause(): Promise<void> {
  await initPlayback();
  if (!player || !snapshot.currentTrack) return;

  const playWhenReady = !snapshot.playWhenReady;
  const sourceReady = engineSource?.token === loadToken;

  // 引擎里没有当前曲目的音源、也没有装载在进行（装载失败后停下，或音源出错）：
  // 重新装载，而不是对引擎里残留的上一首调 play()。
  if (playWhenReady && !sourceReady && snapshot.state !== 'loading') {
    await load(snapshot.currentIndex, { autoPlay: true, direction: 1 });
    return;
  }

  publish({ playWhenReady });
  // 装载中只改意图，replace 完成后由 load() 按意图决定是否 play()
  if (!sourceReady) return;
  if (playWhenReady) player.play();
  else player.pause();
}

export const next = (): Promise<void> => advance(1, 'user');
export const previous = (): Promise<void> => advance(-1, 'user');

async function advance(direction: 1 | -1, reason: AdvanceReason): Promise<void> {
  const target = step(order, direction, snapshot.playMode, reason);

  if (!target) {
    failedInStreak.clear();
    player?.pause();
    publish({ state: 'paused', playWhenReady: false });
    return;
  }

  order = { ...order, position: target.position };

  // 单曲循环自然播完时目标就是当前曲目，引擎里装的也一定是它，重头播即可，不必重新解析地址
  if (
    reason === 'finished' &&
    target.index === snapshot.currentIndex &&
    snapshot.playMode === 'loopOne'
  ) {
    await player?.seekTo(0);
    player?.play();
    return;
  }

  await load(target.index, { autoPlay: true, direction });
}

export async function seekTo(positionMs: number): Promise<void> {
  // 引擎里装的不是当前曲目时，跳转落在的是上一首的残留音源上
  if (!player || !snapshot.currentTrack || engineSource?.token !== loadToken) return;

  const target = Math.max(positionMs, 0);
  // 先把目标位置发出去，再等引擎跳转：界面松手那一刻就要看到新位置，
  // 否则这段等待里读到的还是旧位置，进度条会回弹一下。
  pendingSeek = { positionMs: target, until: Date.now() + SEEK_SETTLE_TIMEOUT_MS };
  publish({ positionMs: target });

  await player.seekTo(target / 1000);
}

export async function setPlayMode(mode: PlayMode): Promise<void> {
  await savePlayMode(mode);
  publish({ playMode: mode });
  // 重建顺序表：切到随机时重新洗牌并把当前曲目钉在首位，切回顺序时恢复队列原序
  order = buildOrder(snapshot.queue.length, mode, snapshot.currentIndex);
}

export function clearFailure(): void {
  if (snapshot.failure !== null) publish({ failure: null });
}

async function load(
  index: number,
  { autoPlay, direction }: { autoPlay: boolean; direction: 1 | -1 },
): Promise<void> {
  const track = snapshot.queue[index];
  if (!track || !player) return;

  const token = (loadToken += 1);
  skipDirection = direction;
  pendingSeek = null;

  // 与上一首音源脱钩（决策 5）：界面已经切到新曲目，上一首继续发声才是错的。
  // 它之后的状态回报由 engineSource 的令牌挡掉，进度与时长先用新曲目自己的。
  player.pause();
  publish({
    currentIndex: index,
    currentTrack: track,
    state: 'loading',
    positionMs: 0,
    durationMs: track.durationMs ?? 0,
    playWhenReady: autoPlay,
  });
  updateLockScreen(track);

  try {
    // 每次播放前实时解析地址，不缓存——插件返回的地址有时效性（决策 4）。
    // 这里是唯一的解析入口，C2 离线缓存将在 resolveTrack 内部拦截。
    const media = await resolveTrack(track);
    if (token !== loadToken) return; // 期间用户又切了歌，丢弃这次结果

    const headers = media.userAgent
      ? { ...media.headers, 'User-Agent': media.userAgent }
      : media.headers;

    player.replace({ uri: media.uri, headers });
    engineSource = { token, uri: media.uri, headers };
    setTimeout(() => void checkSlowLoad(token, track), SLOW_LOAD_CHECK_MS);

    // 按此刻的意图而不是发起装载时的 autoPlay：用户可能在解析期间点了暂停
    if (snapshot.playWhenReady) player.play();
  } catch (error) {
    if (token !== loadToken) return;
    await handleLoadFailure(track, error);
  }
}

/**
 * 记一次播放（add-playback-history/design.md 决策 2、4）。
 *
 * 三条约束都体现在这几行里：
 *
 * 1. **不 await**。历史写入没有理由延后播放开始的时刻。
 * 2. **异常就地吞掉**，绝不能冒泡回 `load()` 的 catch——那里是 `handleLoadFailure`，
 *    它会跳到下一首、累加连续失败计数、甚至把曲目标记为失效。一次写库失败会被
 *    表达成「这首歌播不了」，拿主要能力给次要能力陪葬。
 * 3. **但不静默**。写进 warn，否则线上问题无从查起（与 `src/library/metadata.ts`
 *    的处理一致）。
 *
 * 调用点是 `markSounding`，即本次装载第一次真正发声的时刻（fix-ios-acceptance-issues/
 * design.md 决策 4）。不能早于这一刻：远程地址的「解析」只是把地址原样交出，永远成功，
 * 在 `player.replace` 之后就记，会把地址失效、内容不是音频这些根本没播出来的曲目记进
 * 历史，自动跳过时的每次重试还会各记一次（playback-history spec：播放失败不记入）。
 */
function rememberPlayed(track: Track): void {
  void recordPlay(track.id)
    .then(notifyHistoryChanged)
    .catch((error: unknown) => {
      console.warn('[history] 记录播放失败:', error instanceof Error ? error.message : error);
    });
}

async function handleLoadFailure(track: Track, error: unknown): Promise<void> {
  // 只有「资源确实不在了」才标记失效。网络暂时不可达不标记——否则用户在地铁里
  // 听一次歌，整个远程曲库就被打上失效标记（media-source spec：远程地址失效时
  // 曲目保留在曲库中不被自动删除）。
  if (error instanceof MediaResolutionError && error.marksUnavailable) {
    await setTrackUnavailable(track.id, true);
  }

  // 解析失败自带中文说明（各来源实现已经写好），不需要诊断
  await failTrack(track, error instanceof Error ? error.message : '未知错误。');
}

/**
 * 记下一首曲目的失败，并决定跳过还是停下（media-playback spec：单曲失败不中断整个队列）。
 *
 * 用户仍想播放时沿本次导航的方向跳过；连续失败达到上限，或用户已经暂停，就停在这里。
 * `diagnosis` 是稍后才能得出的更准确的原因：失败处理不等它，结果到达时这条记录若仍属于
 * 这首曲目就改写文案，已被别的失败取代或被清除则丢弃。
 */
async function failTrack(track: Track, reason: string, diagnosis?: Promise<string>): Promise<void> {
  failedInStreak.add(track.id);
  const failedCount = failedInStreak.size;
  const target = step(order, skipDirection, snapshot.playMode, 'skipped');
  const exhausted = target !== null && failedInStreak.has(snapshot.queue[target.index]?.id ?? '');
  const stopped = exhausted || failedCount >= MAX_CONSECUTIVE_FAILURES;
  const describe = (text: string): PlaybackFailure => ({
    trackId: track.id,
    message:
      stopped && failedCount > 1
        ? `连续 ${failedCount} 首无法播放，已停止。最近一首「${track.title}」：${text}`
        : `「${track.title}」播放失败：${text}`,
  });

  publish({ failure: describe(reason) });
  void diagnosis?.then((text) => {
    if (snapshot.failure?.trackId === track.id) publish({ failure: describe(text) });
  });

  if (stopped || !snapshot.playWhenReady) {
    failedInStreak.clear();
    player?.pause();
    publish({ state: 'paused', playWhenReady: false });
    return;
  }

  await advance(skipDirection, 'skipped');
}

const UNDECODABLE = '音频无法解码，格式不受支持或文件已损坏。';

/**
 * 问一次服务端这个地址现在是什么情况（决策 6）。连不上或超时返回 null。
 *
 * expo-audio 在桥接层丢掉了引擎的错误码与 HTTP 状态码，不改原生代码时，最直接的信号就是
 * 服务端对同一请求的回应。只取两个字节、拿到响应头即中止——服务端忽略 Range 时
 * 也不会把整首歌下载下来，所以用能流式读取的 expo/fetch 而不是内置 fetch。
 */
async function probe(
  uri: string,
  headers?: Record<string, string>,
): Promise<{ status: number; contentType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(uri, {
      headers: { ...headers, Range: 'bytes=0-1' },
      signal: controller.signal,
    });
    return { status: response.status, contentType: response.headers.get('content-type') ?? '' };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

const httpErrorReason = (status: number): string =>
  `音频地址返回了错误（HTTP ${status}），可能已失效。`;

/** 服务端自己声明回的是文本或网页（错误页、登录页）。音频不会以这些类型下发。 */
const isTextual = (contentType: string): boolean => /^text\/|html/i.test(contentType);

/** 引擎只报出「Source error」时，把它换成用户看得懂的原因。 */
async function diagnose(uri: string, headers?: Record<string, string>): Promise<string> {
  const response = await probe(uri, headers);
  if (!response) return '无法连接到音频地址，请检查网络后重试。';
  if (response.status >= 400) return httpErrorReason(response.status);
  return UNDECODABLE;
}

/**
 * 装载迟迟没有就绪时，判断是网络慢还是地址本身有问题（fix-ios-acceptance-issues/
 * design.md 决策 2）。
 *
 * iOS 的 AVPlayer 拿到一段网页时不报错，而是一直停在「评估缓冲速率」，与网速慢在引擎
 * 回报上无法区分。能区分二者的只有服务端的回应：状态码出错、或声明的是文本/网页，
 * 就是地址的问题；否则按网络慢处理，继续等——宁可多等，也不把慢速网络上的正常曲目判死。
 * Android 的 ExoPlayer 对这类内容会直接报错，走不到这里。
 */
async function checkSlowLoad(token: number, track: Track): Promise<void> {
  if (token !== loadToken || snapshot.state !== 'loading' || engineSource?.token !== token) return;
  const { uri, headers } = engineSource;
  if (!/^https?:/i.test(uri)) return;

  const response = await probe(uri, headers);
  if (!response || token !== loadToken || snapshot.state !== 'loading') return;

  const reason =
    response.status >= 400
      ? httpErrorReason(response.status)
      : isTextual(response.contentType)
        ? UNDECODABLE
        : null;
  if (!reason) return;

  engineSource = null;
  await failTrack(track, reason);
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
