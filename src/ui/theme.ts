// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 琥珀音乐 AmberMusic

/**
 * 设计令牌，取自设计稿 `ui.pen` 的文档变量，逐值对应，不做近似。
 *
 * 设计稿是纯深色方案，没有浅色形态，因此这里不提供明暗两套——凭空补一套浅色
 * 只会与设计稿脱节。跟随系统的配色留待设计稿给出浅色形态后再做。
 */
export const Colors = {
  bg: '#0A0A0C',
  surface: '#17171C',
  surface2: '#232329',
  accent: '#C8FF4D',
  accentSoft: '#C8FF4D1F',
  text: '#F6F6F8',
  textMuted: '#8C8C97',
  line: '#26262D',
  /** 底部悬浮 Dock 的半透明底色 */
  dock: '#1C1C22B8',
  dockBorder: '#FFFFFF14',
} as const;

/** 设计稿的 `font` 变量为 Inter；下面是 expo-google-fonts 中对应的字重别名。 */
export const Font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** 设计稿 `pad` 变量 = 20，即屏幕内容区的左右内边距。 */
export const SCREEN_PADDING = 20;

/** 底部 Dock（迷你播放器 + 标签栏）的总高度，用于给列表留出滚动余量。 */
export const DOCK_HEIGHT = 138;
