// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

/**
 * 插件调用的唯一通道（design.md 决策 7）。
 *
 * 宿主不把插件方法直接交给上层。plugin-source spec 要求对三类故障——抛异常、返回畸形
 * 数据、长时间无响应——都有确定行为，并说明「是哪个插件出了什么问题」。分散在每个调用
 * 点各写一遍 try/catch，必然有遗漏；后续切片每接入一个协议方法就要重复一次。
 */

/**
 * 单次插件调用的等待上限。
 *
 * 保守取值：插件普遍要串起若干次网络请求（取列表页、解密、再取地址），移动网络下
 * 几秒是常态。取得太短会把正常的慢插件误判为无响应。design.md 已把「按真实插件的
 * 耗时分布校准」列为待定项，此处是校准前的起点。
 */
const DEFAULT_TIMEOUT_MS = 15_000;

export type PluginCallFailure = 'not-implemented' | 'timeout' | 'threw' | 'malformed';

export class PluginCallError extends Error {
  readonly platform: string;
  readonly method: string;
  readonly kind: PluginCallFailure;

  constructor(platform: string, method: string, kind: PluginCallFailure, detail: string) {
    super(`插件「${platform}」的 ${method} ${detail}`);
    this.name = 'PluginCallError';
    this.platform = platform;
    this.method = method;
    this.kind = kind;
  }
}

export type InvokeOptions<T> = {
  platform: string;
  method: string;
  /** 插件方法。为 undefined 表示插件未实现该方法。 */
  call: (() => unknown) | undefined;
  /** 返回值形状校验。不符合契约时返回 null，由本层统一归因为 malformed。 */
  parse: (raw: unknown) => T | null;
  timeoutMs?: number;
};

export async function invokePlugin<T>({
  platform,
  method,
  call,
  parse,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: InvokeOptions<T>): Promise<T> {
  if (!call) {
    throw new PluginCallError(platform, method, 'not-implemented', '未实现。');
  }

  let raw: unknown;
  try {
    // 同步抛出与异步 reject 都要接住：插件常在方法体开头做同步的参数检查。
    raw = await withTimeout(platform, method, Promise.resolve(call()), timeoutMs);
  } catch (error) {
    if (error instanceof PluginCallError) throw error;
    throw new PluginCallError(platform, method, 'threw', `调用失败：${describe(error)}`);
  }

  const parsed = parse(raw);
  if (parsed === null) {
    throw new PluginCallError(platform, method, 'malformed', '返回了不符合协议的数据。');
  }
  return parsed;
}

/**
 * 超时只是**停止等待**，插件那边的工作并不会被真正取消——JS 没有中断第三方代码执行的
 * 手段。这不影响 spec 要求的行为（界面恢复可操作、其他插件不受影响），但要写明，
 * 免得后来者误以为超时能回收资源。
 */
function withTimeout<T>(
  platform: string,
  method: string,
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new PluginCallError(platform, method, 'timeout', `超过 ${timeoutMs / 1000} 秒未返回。`),
      );
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
