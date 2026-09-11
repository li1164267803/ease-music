// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { Redirect } from 'expo-router';

/** 平台中立的插件候选曲目分页页——**空实现**，裁剪机制的说明见 `manage.tsx`。 */
export default function PluginDiscoveryTracksScreen() {
  return <Redirect href="/" />;
}
