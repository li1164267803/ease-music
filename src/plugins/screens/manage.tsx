// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { Redirect } from 'expo-router';

/**
 * 平台中立的插件管理页——**空实现**，与 `@/plugins/index.ts` 是同一条裁剪机制。
 *
 * 路由文件本身必须是平台中立的（expo-router 不会把 `.android` 从路由名里剥掉，
 * `plugins.android.tsx` 会变成 `/plugins.android` 这么一个路由），因此分界线落在
 * 这里：路由文件转发到本模块，Android 侧由 `manage.android.tsx` 顶替。
 *
 * iOS 上没有任何界面链接到该路由；万一被直接导航到，退回首页而不是留一个空白屏。
 */
export default function PluginManageScreen() {
  return <Redirect href="/" />;
}
