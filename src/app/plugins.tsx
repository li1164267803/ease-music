// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

/**
 * 插件管理路由。
 *
 * 路由文件必须是平台中立的——expo-router 不会把 `.android` 从路由名里剥掉，
 * `plugins.android.tsx` 会变成 `/plugins.android` 这么一个路由。因此裁剪的分界线
 * 落在被转发的模块上：iOS 解析到空实现，Android 解析到真实界面。
 *
 * iOS 上没有任何界面链接到该路由（`Plugins.supported` 为 false 时入口不渲染）。
 */
export { default } from '@/plugins/screens/manage';
