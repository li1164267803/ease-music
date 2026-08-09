// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { LucideIcon } from 'lucide-react-native';
import { Pressable, type ViewStyle } from 'react-native';

import { Colors } from '@/ui/theme';

type CircleButtonProps = {
  Icon: LucideIcon;
  /** 设计稿用到三种直径：顶部动作 38、歌单操作 46、Hero 播放 52 */
  size: number;
  iconSize: number;
  background?: string;
  color?: string;
  /** 播放/暂停一类实心图标需要填充，线性图标不填 */
  filled?: boolean;
  /** 未接入能力的按钮不传，渲染出来但不可点 */
  onPress?: () => void;
  style?: ViewStyle;
};

/** 设计稿反复出现的圆形图标按钮。 */
export function CircleButton({
  Icon,
  size,
  iconSize,
  background = Colors.surface,
  color = Colors.text,
  filled = false,
  onPress,
  style,
}: CircleButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: background,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Icon size={iconSize} color={color} fill={filled ? color : 'transparent'} />
    </Pressable>
  );
}
