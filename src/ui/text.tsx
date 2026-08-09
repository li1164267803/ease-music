// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { Text, type TextProps, type TextStyle } from 'react-native';

import { Colors, Font } from '@/ui/theme';

type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

export type AppTextProps = TextProps & {
  size?: number;
  weight?: Weight;
  color?: string;
  /** 绝对行高，直接填设计稿给出的 px 值 */
  lineHeight?: number;
  /** 设计稿的 letter-spacing，负值用于大字号标题 */
  letterSpacing?: number;
};

/**
 * 统一承载设计稿的字体族与字重映射。设计稿里的字重是 normal/500/600/700，
 * Inter 的可变字重在 RN 上要靠不同的字体文件表达，因此换成具名字重。
 */
export function AppText({
  size = 13,
  weight = 'regular',
  color = Colors.text,
  lineHeight,
  letterSpacing,
  style,
  ...rest
}: AppTextProps) {
  const base: TextStyle = {
    fontFamily: Font[weight],
    fontSize: size,
    color,
    ...(lineHeight === undefined ? null : { lineHeight }),
    ...(letterSpacing === undefined ? null : { letterSpacing }),
  };
  return <Text style={[base, style]} {...rest} />;
}
