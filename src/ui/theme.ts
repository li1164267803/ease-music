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

/**
 * 字号阶梯，对应设计稿的 `$fs-*` 变量。设计稿里所有文本都绑定到这八档之一，
 * 新页面不要再引入档位之外的字号——差 1、2 像素的近似值正是散乱的来源。
 */
export const FontSize = {
  /** 11 · 标签栏文字、图片上的角标 */
  micro: 11,
  /** 12 · 副标题、时长、说明文字，用量最大的一档 */
  caption: 12,
  /** 13 · 列表主文本、Chip 文字 */
  label: 13,
  /** 14 · 正文、按钮文字 */
  body: 14,
  /** 17 · 区块小标题（「为你推荐」「我的歌单」） */
  section: 17,
  /** 22 · 统计数值 */
  stat: 22,
  /** 24 · 页面主标题 */
  title: 24,
  /** 26 · 歌曲 / 歌单级大标题 */
  display: 26,
} as const;

/** 圆角阶梯，对应设计稿的 `$r-*` 变量。 */
export const Radius = {
  /** 3 · 进度条一类的极小圆角 */
  xs: 3,
  /** 12 · 小尺寸封面（42~50） */
  sm: 12,
  /** 16 · 列表行、搜索框、中等封面 */
  md: 16,
  /** 20 · 卡片、迷你播放器、Hero、大封面 */
  lg: 20,
  /** 26 · 播放页主封面 */
  xl: 26,
  /** 正圆与胶囊：给足够大的值由渲染层裁到半高 */
  full: 999,
} as const;

/**
 * 间距阶梯，对应设计稿的 `$sp-*` 变量。名称与设计稿逐一对齐，方便对照查改。
 */
export const Spacing = {
  /** 2 */
  s0: 2,
  /** 4 */
  s1: 4,
  /** 8 */
  s2: 8,
  /** 12 */
  s3: 12,
  /** 14 · 卡片与区块之间最常用的一档 */
  s4: 14,
  /** 18 */
  s5: 18,
  /** 22 · 区块之间的大间隔、屏幕底部留白 */
  s6: 22,
} as const;

/**
 * 图标尺寸阶梯。设计稿里 icon 的宽高不支持绑定变量，只能写数值，
 * 因此这里是唯一的权威定义——改档位要同时改设计稿里的数值。
 */
export const IconSize = {
  /** 16 · 状态栏、行尾的更多按钮 */
  xs: 16,
  /** 18 · 列表与卡片内的操作图标 */
  sm: 18,
  /** 20 · 播放页次级控制、设置项 */
  md: 20,
  /** 24 · 顶栏返回 / 更多、收藏 */
  lg: 24,
  /** 30 · 播放页主控制（上一首 / 下一首） */
  xl: 30,
} as const;

/** 设计稿 `pad` 变量 = 20，即屏幕内容区的左右内边距。 */
export const SCREEN_PADDING = 20;

/** 底部 Dock（迷你播放器 + 标签栏）的总高度，用于给列表留出滚动余量。 */
export const DOCK_HEIGHT = 138;

/** 栈内页面只悬浮迷你播放器、没有标签栏，列表留出的余量相应少一截。 */
export const MINI_DOCK_HEIGHT = 78;

/** 设计稿 Hero、封面等大图上的深色遮罩渐变（左透明 → 右不透明）。 */
export const SCRIM_GRADIENT = 'linear-gradient(90deg, #0A0A0C00 0%, #0A0A0CE6 62%, #0A0A0C 100%)';
