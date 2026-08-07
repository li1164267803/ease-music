// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 琥珀音乐 AmberMusic

import { Text, type TextProps, type TextStyle } from 'react-native';

import { Colors, Font } from '@/ui/theme';

type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

export type AppTextProps = TextProps & {
  size?: number;
  weight?: Weight;
  color?: string;
  lineHeight?: number;
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
  style,
  ...rest
}: AppTextProps) {
  const base: TextStyle = {
    fontFamily: Font[weight],
    fontSize: size,
    color,
    ...(lineHeight === undefined ? null : { lineHeight: size * lineHeight }),
  };
  return <Text style={[base, style]} {...rest} />;
}
