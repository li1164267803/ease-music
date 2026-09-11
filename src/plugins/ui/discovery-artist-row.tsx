// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import type { DiscoveryArtist } from '@/plugins/discovery';
import { Artwork } from '@/ui/artwork';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';

/** 艺人搜索结果的列表行：圆形头像、名字、来源插件；点开进艺人页。 */
export function DiscoveryArtistRow({ artist }: { artist: DiscoveryArtist }) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/plugin-discovery/artist',
          params: { artist: JSON.stringify(artist) },
        })
      }
      style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}
    >
      <Artwork uri={artist.avatarUri} width={50} height={50} radius={25} />
      <View style={{ flex: 1, gap: 4 }}>
        <AppText size={14} weight="medium" numberOfLines={1}>
          {artist.name}
        </AppText>
        <AppText size={12} color={Colors.textMuted} numberOfLines={1}>
          {artist.platform}
        </AppText>
      </View>
    </Pressable>
  );
}
