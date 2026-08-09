// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { Pressable, View } from 'react-native';

import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';

type SectionHeadProps = {
  title: string;
  /** 右侧的次要文字：可点时是「查看全部」一类入口，不可点时是计数 */
  trailing?: string;
  onTrailingPress?: () => void;
};

/** 设计稿的区块标题行：17 粗体标题 + 右侧 12 灰字。 */
export function SectionHead({ title, trailing, onTrailingPress }: SectionHeadProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <AppText size={17} weight="bold">
        {title}
      </AppText>
      {trailing === undefined ? null : (
        <Pressable onPress={onTrailingPress} disabled={!onTrailingPress} hitSlop={10}>
          <AppText size={12} color={Colors.textMuted}>
            {trailing}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}
