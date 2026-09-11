// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import {
  fetchSheetTags,
  fetchTopLists,
  type DiscoveryGroup,
  type DiscoveryItem,
  type DiscoveryTag,
} from '@/plugins/discovery';
import type { LoadedPlugin } from '@/plugins/host/loader';
import { discoveryPlugins } from '@/plugins/manager';
import { ScreenHeader } from '@/plugins/ui/screen-header';
import { Chip } from '@/ui/chip';
import { MediaCard } from '@/ui/media-card';
import { Screen } from '@/ui/screen';
import { SectionHead } from '@/ui/section-head';
import { AppText } from '@/ui/text';
import { Colors, SCREEN_PADDING } from '@/ui/theme';
import { useMiniDockInset } from '@/ui/mini-player';

/**
 * 插件发现首页。
 *
 * 每个具备发现能力的插件一个区块，区块内自带加载中、失败原因、内容三态
 * （add-plugin-discovery-charts/design.md 决策 6）；某个插件慢或失败不影响其余区块。
 * 所有内容都来自用户自己安装的插件，本页不内置任何榜单或推荐（plugin-discovery spec）。
 */
export default function PluginDiscoveryScreen() {
  const dockInset = useMiniDockInset();
  const plugins = discoveryPlugins();

  return (
    <Screen>
      <ScreenHeader title="插件发现" />

      {plugins.length === 0 ? (
        <AppText size={12} color={Colors.textMuted} lineHeight={19}>
          当前没有可用于浏览的插件。已安装的插件中没有提供榜单或推荐歌单能力的，或者你还没有安装任何插件。
        </AppText>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 22, paddingBottom: dockInset }}
        >
          {plugins.map((plugin) => (
            <PluginSection key={plugin.meta.platform} plugin={plugin} />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

type RequestState<T> =
  { status: 'loading' } | { status: 'failed'; reason: string } | { status: 'done'; value: T };

/**
 * 进入时发起一次插件请求。每次挂载都重新请求，不复用上次结果——spec 要求发现内容
 * 实时获取。`enabled` 为 false 表示插件没有这项能力，直接不请求、不占位。
 */
function useDiscoveryRequest<T>(
  plugin: LoadedPlugin,
  fetcher: (plugin: LoadedPlugin) => Promise<T>,
  enabled: boolean,
): RequestState<T> | null {
  const [state, setState] = useState<RequestState<T>>({ status: 'loading' });

  useEffect(() => {
    if (!enabled) return;
    fetcher(plugin).then(
      (value) => setState({ status: 'done', value }),
      (error: unknown) =>
        setState({
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        }),
    );
  }, [plugin, fetcher, enabled]);

  return enabled ? state : null;
}

function PluginSection({ plugin }: { plugin: LoadedPlugin }) {
  const { meta } = plugin;
  const topLists = useDiscoveryRequest(plugin, fetchTopLists, meta.canBrowseTopLists);
  const tags = useDiscoveryRequest(plugin, fetchSheetTags, meta.canBrowseSheets);

  return (
    <View style={{ gap: 14 }}>
      <SectionHead title={meta.platform} />

      {topLists ? (
        <View style={{ gap: 12 }}>
          <AppText size={13} weight="semibold" color={Colors.textSubtle}>
            榜单
          </AppText>
          {topLists.status === 'done' ? (
            <TopListGroups platform={meta.platform} groups={topLists.value} />
          ) : (
            <Pending state={topLists} />
          )}
        </View>
      ) : null}

      {tags ? (
        <View style={{ gap: 12 }}>
          <AppText size={13} weight="semibold" color={Colors.textSubtle}>
            推荐歌单
          </AppText>
          {tags.status === 'done' ? (
            <TagGroups platform={meta.platform} groups={tags.value} />
          ) : (
            <Pending state={tags} />
          )}
        </View>
      ) : null}
    </View>
  );
}

function Pending({ state }: { state: RequestState<unknown> }) {
  if (state.status === 'failed') {
    return (
      <AppText size={11} color={Colors.danger} lineHeight={17}>
        {state.reason}
      </AppText>
    );
  }
  return <ActivityIndicator color={Colors.accent} style={{ alignSelf: 'flex-start' }} />;
}

/** 榜单按插件返回的分组呈现，每组一行横向滚动的封面卡。 */
function TopListGroups({
  platform,
  groups,
}: {
  platform: string;
  groups: DiscoveryGroup<DiscoveryItem>[];
}) {
  const router = useRouter();

  if (groups.length === 0) {
    return (
      <AppText size={12} color={Colors.textMuted}>
        该插件没有返回任何榜单。
      </AppText>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {groups.map((group, index) => (
        <View key={group.title ?? index} style={{ gap: 10 }}>
          {group.title ? (
            <AppText size={12} color={Colors.textMuted}>
              {group.title}
            </AppText>
          ) : null}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -SCREEN_PADDING }}
            contentContainerStyle={{ gap: 14, paddingHorizontal: SCREEN_PADDING }}
          >
            {group.items.map((item) => (
              <MediaCard
                key={item.id}
                coverUri={item.artworkUri}
                title={item.title}
                meta={item.description ?? ''}
                coverHeight={142}
                width={150}
                onPress={() =>
                  router.push({
                    pathname: '/plugin-discovery/tracks',
                    // 榜单项是插件的凭据，序列化后随路由传递（design.md 决策 4）
                    params: { platform, kind: 'toplist', item: JSON.stringify(item) },
                  })
                }
              />
            ))}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

/** 标签按分组以胶囊呈现；置顶标签是第一个无标题分组。 */
function TagGroups({
  platform,
  groups,
}: {
  platform: string;
  groups: DiscoveryGroup<DiscoveryTag>[];
}) {
  const router = useRouter();

  if (groups.length === 0) {
    return (
      <AppText size={12} color={Colors.textMuted}>
        该插件没有返回任何标签。
      </AppText>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {groups.map((group, index) => (
        <View key={group.title ?? index} style={{ gap: 10 }}>
          {group.title ? (
            <AppText size={12} color={Colors.textMuted}>
              {group.title}
            </AppText>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {group.items.map((tag) => (
              <Chip
                key={tag.id}
                label={tag.title}
                active={false}
                onPress={() =>
                  router.push({
                    pathname: '/plugin-discovery/sheets',
                    params: { platform, tag: JSON.stringify(tag) },
                  })
                }
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
