// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 琥珀音乐 AmberMusic

import { Image } from 'expo-image';
import { Music } from 'lucide-react-native';
import { View } from 'react-native';

import { Colors } from '@/ui/theme';

type ArtworkProps = {
  uri: string | null;
  size: number;
  radius: number;
};

/**
 * 封面。无封面时显示统一占位（music-library spec：布局不发生错乱），
 * 占位块与真实封面尺寸完全一致，因此列表行高不会因有无封面而跳动。
 */
export function Artwork({ uri, size, radius }: ArtworkProps) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
        // 封面已在导入时按内容哈希落盘，磁盘缓存足够；内存缓存交给 expo-image 自行管理
        cachePolicy="memory-disk"
        transition={120}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: Colors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Music size={Math.round(size * 0.36)} color={Colors.textMuted} />
    </View>
  );
}
