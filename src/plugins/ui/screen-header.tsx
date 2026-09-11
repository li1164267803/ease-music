// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { AppText } from '@/ui/text';
import { Colors, IconSize } from '@/ui/theme';

/**
 * 发现层各页的头部：返回 + 标题，可带一行说明来源插件的副标题。
 * 版式与插件搜索页、插件管理页的头部一致。
 */
export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <ChevronLeft size={IconSize.lg} color={Colors.text} />
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText size={24} weight="bold" letterSpacing={-0.5} numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText size={12} color={Colors.textMuted} numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
