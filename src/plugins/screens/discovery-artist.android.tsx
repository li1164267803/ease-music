// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';

import type { DiscoveryArtist } from '@/plugins/discovery';
import { getLoadedPlugin } from '@/plugins/manager';
import { ScreenHeader } from '@/plugins/ui/screen-header';
import { Artwork } from '@/ui/artwork';
import { Screen } from '@/ui/screen';
import { SheetAction } from '@/ui/sheet';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';
import { useMiniDockInset } from '@/ui/mini-player';

/**
 * 艺人页：一张信息卡加两个入口（add-plugin-discovery-albums-artists/design.md 决策 3）。
 * 单曲与专辑各自导航到已有的列表页，这里不做就地分页。
 */
export default function PluginDiscoveryArtistScreen() {
  const dockInset = useMiniDockInset();
  const router = useRouter();
  const { artist: artistParam } = useLocalSearchParams<{ artist: string }>();

  const artist = useMemo(() => JSON.parse(artistParam) as DiscoveryArtist, [artistParam]);
  const { platform } = artist;
  const plugin = getLoadedPlugin(platform);

  return (
    <Screen>
      <ScreenHeader title={artist.name} subtitle={platform} />
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 22, paddingBottom: dockInset }}
      >
        <View style={{ alignItems: 'center' }}>
          <Artwork uri={artist.avatarUri} width={120} height={120} radius={60} />
        </View>

        {/* 入口在简介之前：简介可能长达几屏（小蜗的艺人简介实测如此），入口不能被它挤出视野。
            插件未实现取作品的方法时入口不出现，不视为错误（plugin-discovery spec） */}
        {plugin?.meta.canBrowseArtistWorks ? (
          <View style={{ gap: 10 }}>
            <SheetAction
              label="单曲"
              hint="该艺人的曲目，可逐首加入曲库"
              onPress={() =>
                router.push({
                  pathname: '/plugin-discovery/tracks',
                  params: { platform, kind: 'artist', item: artistParam },
                })
              }
            />
            <SheetAction
              label="专辑"
              hint="该艺人的专辑"
              onPress={() =>
                router.push({
                  pathname: '/plugin-discovery/items',
                  params: { platform, kind: 'artist-album', source: artistParam },
                })
              }
            />
          </View>
        ) : null}

        {artist.description ? (
          <AppText size={12} color={Colors.textMuted} lineHeight={19}>
            {artist.description}
          </AppText>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
