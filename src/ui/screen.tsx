// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 琥珀音乐 AmberMusic

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, SCREEN_PADDING } from '@/ui/theme';

/**
 * 屏幕容器。设计稿的内容区左右内边距为 `pad` 变量（20），顶部紧贴状态栏之下。
 */
export function Screen({ children, gap = 18 }: { children: ReactNode; gap?: number }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.bg,
        paddingTop: insets.top + 6,
        paddingHorizontal: SCREEN_PADDING,
        gap,
      }}
    >
      {children}
    </View>
  );
}
