// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { Image } from 'expo-image';
import { Music } from 'lucide-react-native';
import { useState } from 'react';
import { View, type DimensionValue } from 'react-native';

import { Colors } from '@/ui/theme';

type ArtworkProps = {
  /** 封面地址。可以是内嵌封面落盘后的本地 URI，也可以是来源提供的远程地址。 */
  uri: string | null;
  /** 设计稿里的封面既有正方形（列表、迷你播放器），也有定高撑满的（网格卡、播放页） */
  width: DimensionValue;
  height: number;
  radius: number;
};

/**
 * 封面。无封面时显示统一占位（music-library spec：布局不发生错乱），
 * 占位块与真实封面尺寸完全一致，因此行高与网格不会因有无封面而跳动。
 *
 * 远程封面（插件、网盘曲目）加载失败时同样回退到占位图——music-library spec 要求
 * 远程封面不可用不得影响播放与其他行为。缓存交给 expo-image 的磁盘缓存，
 * 同一地址不重复下载。
 */
export function Artwork({ uri, width, height, radius }: ArtworkProps) {
  // 记住「哪一张」加载失败而不是「失败过」：列表行会被回收复用，只记一个布尔量的话，
  // 换上另一首曲目的封面后仍会停在占位图上。
  const [failedUri, setFailedUri] = useState<string | null>(null);

  if (uri && uri !== failedUri) {
    return (
      <Image
        source={{ uri }}
        style={{ width, height, borderRadius: radius }}
        contentFit="cover"
        // 内嵌封面已在导入时按内容哈希落盘，远程封面则靠这里的磁盘缓存避免重复下载
        cachePolicy="memory-disk"
        transition={120}
        onError={() => setFailedUri(uri)}
      />
    );
  }

  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: Colors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Music size={Math.round(height * 0.36)} color={Colors.textMuted} />
    </View>
  );
}
