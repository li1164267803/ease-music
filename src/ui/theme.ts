// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

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
  /** 压在封面上的副标题：比 textMuted 亮一档，深色图面上才读得清 */
  textSubtle: '#C9C9D2',
  line: '#26262D',
  /** 底部悬浮 Dock 的半透明底色 */
  dock: '#1C1C22B8',
  dockBorder: '#FFFFFF14',
  /** 迷你播放器一类实心卡片的极淡描边 */
  cardBorder: '#FFFFFF12',
  /** 设计稿未给危险色；错误提示统一用这一个值，不要再散落字面量 */
  danger: '#FF6B6B',
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

/** 栈内页面只悬浮迷你播放器、没有标签栏，列表留出的余量相应少一截。 */
export const MINI_DOCK_HEIGHT = 78;

/** 设计稿 Hero、封面等大图上的深色遮罩渐变（左透明 → 右不透明）。 */
export const SCRIM_GRADIENT = 'linear-gradient(90deg, #0A0A0C00 0%, #0A0A0CE6 62%, #0A0A0C 100%)';
