// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

/**
 * 插件协议的类型描述。
 *
 * 形状对齐 MusicFree 的公开插件规范，以便既有插件可直接复用——**仅参考协议规范，
 * 不复制其源代码**（AGPL-3.0 传染性约束，见 PRODUCT.md）。
 *
 * 两条贯穿全文件的原则：
 *
 * 1. **所有协议方法一律可选**（plugin-source spec「插件的执行环境与兼容性契约」）。
 *    插件未实现的方法在界面上表现为该功能不可用，而不是报错。
 * 2. **返回值一律声明为 `unknown`**。这些值来自第三方代码，编译期的类型标注对它们
 *    没有任何约束力；写成具体类型只会制造「已经校验过」的错觉。真正的把关在
 *    `host/invoke.ts` 的运行时形状校验里，本文件只描述调用方式。
 */

/** 播放地址可否缓存。本项目始终实时解析，等价于永远按 `no-store` 处理（design.md 决策 5）。 */
export type PluginCacheControl = 'cache' | 'no-cache' | 'no-store';

export type PluginSearchType = 'music' | 'album' | 'artist' | 'sheet' | 'lyric';

export type PluginQuality = 'low' | 'standard' | 'high' | 'super';

/** 插件声明的、需要用户自行填写的变量（账号 cookie、访问令牌等）。 */
export type PluginUserVariable = {
  key: string;
  name?: string;
  hint?: string;
  /** 单行输入还是多行文本。cookie 往往很长，插件会声明为 textarea。 */
  field?: 'input' | 'textarea';
};

/**
 * 插件返回的曲目条目。字段由插件自行决定，宿主只认得 `primaryKey` 声明的那几个
 * 以及标题、艺术家这类展示字段——其余原样保留，作为下次解析地址时回传给插件的凭据。
 */
export type PluginMediaItem = Record<string, unknown>;

/** 插件模块导出的对象。元字段 + 一组全部可选的异步方法。 */
export type PluginInstance = {
  /** 插件名。既是插件的唯一标识，也是其曲目在曲库中的来源标识（design.md 决策 2）。 */
  platform?: unknown;
  version?: unknown;
  /** 插件自述的更新地址。未声明时更新入口不可用。 */
  srcUrl?: unknown;
  author?: unknown;
  /** 插件声明的、自己支持的宿主版本范围（semver 区间）。 */
  appVersion?: unknown;
  /** 曲目在该插件内的主键字段名，可为联合主键。缺省为 `['id']`（design.md 决策 4）。 */
  primaryKey?: unknown;
  cacheControl?: unknown;
  hints?: unknown;
  userVariables?: unknown;
  supportedSearchType?: unknown;

  search?: (query: string, page: number, type: PluginSearchType) => unknown;
  getMediaSource?: (mediaItem: PluginMediaItem, quality: PluginQuality) => unknown;
  getMusicInfo?: (mediaItem: PluginMediaItem) => unknown;
  getLyric?: (mediaItem: PluginMediaItem) => unknown;
  getAlbumInfo?: (albumItem: PluginMediaItem, page: number) => unknown;
  getMusicSheetInfo?: (sheetItem: PluginMediaItem, page: number) => unknown;
  getArtistWorks?: (artistItem: PluginMediaItem, page: number, type: PluginSearchType) => unknown;
  getTopLists?: () => unknown;
  getTopListDetail?: (topListItem: PluginMediaItem, page: number) => unknown;
  getRecommendSheetTags?: () => unknown;
  getRecommendSheetsByTag?: (tag: PluginMediaItem, page: number) => unknown;
  importMusicItem?: (urlLike: string) => unknown;
  importMusicSheet?: (urlLike: string) => unknown;
  getMusicComments?: (mediaItem: PluginMediaItem) => unknown;
};

/** 本切片实际调用的方法。其余方法只保证「能被加载、不报错」（design.md Non-Goals）。 */
export type PluginMethod = keyof PluginInstance;

/**
 * 校验后的插件元信息。
 *
 * 与 `PluginInstance` 的区别是这里的每个字段都已经过运行时校验，可以放心使用；
 * 上层只接触本类型，不直接接触插件对象。
 */
export type PluginMeta = {
  /** 插件自述的插件名，同时是来源标识。 */
  platform: string;
  version: string | null;
  srcUrl: string | null;
  author: string | null;
  appVersion: string | null;
  primaryKey: string[];
  cacheControl: PluginCacheControl;
  userVariables: PluginUserVariable[];
  supportedSearchType: PluginSearchType[] | null;
  /**
   * 是否可用于**音乐**搜索：既实现了 `search`，又声明支持 `music` 类型。
   *
   * 两个条件缺一不可。只看有没有 `search` 方法是不够的——歌词类插件同样实现了它，
   * 但只认 `lyric` 类型，拿 `music` 去调它只会拿回一堆不成形状的数据，然后界面
   * 报一个「插件出错了」。而 plugin-source spec 要的是这类插件**不出现在搜索来源中、
   * 界面不提示错误**。
   *
   * 未声明 `supportedSearchType` 时按协议缺省视为支持——不能因为插件省了一个可选
   * 字段就把它挡在门外。
   */
  canSearchMusic: boolean;
  /** 是否实现了取播放地址。未实现的插件其曲目无法播放。 */
  canResolveMedia: boolean;
};

/** 插件的默认主键。协议规定缺省为 `['id']`。 */
export const DEFAULT_PRIMARY_KEY: readonly string[] = ['id'];

/**
 * 联合主键拼接用的分隔符（design.md 决策 4）。
 *
 * 选 `U+001F` 而不是 `-` 或 `:`：这些字符可能出现在字段值里，两个不同曲目会拼出同一个
 * key，去重就出错了。控制字符不会出现在正常的 id 中。
 */
export const PRIMARY_KEY_SEPARATOR = '\u001f';
