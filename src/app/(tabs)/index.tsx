// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { ImageBackground } from 'expo-image';
import { useRouter } from 'expo-router';
import { Bell, Cast, Play } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import type { Track } from '@/domain/model/track';
import { playPlaylist } from '@/library/actions';
import { useCollections, usePlaylists, useTracks } from '@/library/store';
import { playQueue } from '@/playback/player';
import { usePlayback } from '@/playback/use-playback';
import { Chip } from '@/ui/chip';
import { CircleButton } from '@/ui/circle-button';
import { formatGreeting, formatTotalDuration } from '@/ui/format';
import { MediaCard } from '@/ui/media-card';
import { Screen } from '@/ui/screen';
import { SectionHead } from '@/ui/section-head';
import { AppText } from '@/ui/text';
import { Colors, DOCK_HEIGHT, SCREEN_PADDING, SCRIM_GRADIENT } from '@/ui/theme';
import { TrackActionsSheet } from '@/ui/track-actions-sheet';
import { TRACK_ROW_GAP, TrackRow } from '@/ui/track-row';

/** 发现页顶部胶囊里最多列出的歌单数量，超出的部分在音乐库页看。 */
const CHIP_LIMIT = 4;
/** 「为你推荐」横滑里最多展示的专辑数量。 */
const CAROUSEL_LIMIT = 10;
/** 「最近添加」列出的曲目数量，与设计稿一致。 */
const RECENT_LIMIT = 3;

const DAY = 86400000;

export default function DiscoverScreen() {
  const router = useRouter();
  const playback = usePlayback();

  const playlists = usePlaylists();
  const albums = useCollections('album');
  const recent = useTracks('addedAt', '');

  // null 代表「全部」，此时 Hero 展示当日精选；选中某个歌单则 Hero 换成它
  const [pinned, setPinned] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<Track | null>(null);

  const greeting = formatGreeting();
  const featured = pinned
    ? (playlists.find((playlist) => playlist.id === pinned) ?? null)
    : dailyPick(playlists);

  return (
    <Screen gap={0}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 22, paddingBottom: DOCK_HEIGHT }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <View style={{ gap: 2 }}>
            <AppText size={12} color={Colors.textMuted}>
              {greeting.eyebrow}
            </AppText>
            <AppText size={24} weight="bold" letterSpacing={-0.5}>
              {greeting.title}
            </AppText>
          </View>
          {/* 通知与投屏是设计稿画出的入口，C1 没有对应能力，渲染但不可点 */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <CircleButton Icon={Bell} size={38} iconSize={17} />
            <CircleButton Icon={Cast} size={38} iconSize={17} />
          </View>
        </View>

        {playlists.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -SCREEN_PADDING }}
            contentContainerStyle={{ gap: 8, paddingHorizontal: SCREEN_PADDING }}
          >
            <Chip
              label="全部"
              active={pinned === null}
              onPress={() => setPinned(null)}
              radius={16}
              paddingHorizontal={15}
            />
            {playlists.slice(0, CHIP_LIMIT).map((playlist) => (
              <Chip
                key={playlist.id}
                label={playlist.name}
                active={pinned === playlist.id}
                onPress={() => setPinned(playlist.id)}
                radius={16}
                paddingHorizontal={15}
              />
            ))}
          </ScrollView>
        ) : null}

        {featured ? (
          <Pressable
            onPress={() => router.push(`/playlist/${featured.id}`)}
            style={{
              height: 186,
              borderRadius: 20,
              overflow: 'hidden',
              backgroundColor: Colors.surface,
            }}
          >
            <ImageBackground
              source={featured.coverUri ? { uri: featured.coverUri } : undefined}
              contentFit="cover"
              style={{ flex: 1, justifyContent: 'flex-end' }}
            >
              <View
                style={{
                  experimental_backgroundImage: SCRIM_GRADIENT,
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  gap: 12,
                  padding: 16,
                }}
              >
                <View style={{ flex: 1, gap: 5 }}>
                  <AppText size={11} weight="semibold" color={Colors.accent} letterSpacing={1}>
                    {pinned === null ? '每日精选歌单' : '你的歌单'}
                  </AppText>
                  <AppText size={26} weight="bold" letterSpacing={-0.6} numberOfLines={1}>
                    {featured.name}
                  </AppText>
                  <AppText size={12} color={Colors.textSubtle} numberOfLines={1}>
                    {playlistMeta(featured.trackCount, featured.durationMs)}
                  </AppText>
                </View>
                <CircleButton
                  Icon={Play}
                  size={52}
                  iconSize={22}
                  background={Colors.accent}
                  color={Colors.bg}
                  filled
                  onPress={() => void playPlaylist(featured.id)}
                />
              </View>
            </ImageBackground>
          </Pressable>
        ) : (
          <EmptyHero onPress={() => router.push('/library')} />
        )}

        {albums.length > 0 ? (
          <View style={{ gap: 14 }}>
            <SectionHead
              title="为你推荐"
              trailing="查看全部"
              onTrailingPress={() => router.push('/library')}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -SCREEN_PADDING }}
              contentContainerStyle={{ gap: 14, paddingHorizontal: SCREEN_PADDING }}
            >
              {albums.slice(0, CAROUSEL_LIMIT).map((album) => (
                <MediaCard
                  key={album.name}
                  coverUri={album.coverUri}
                  title={album.name}
                  meta={album.meta}
                  coverHeight={142}
                  width={150}
                  onPress={() => void playQueue(album.tracks)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {recent.length > 0 ? (
          <View style={{ gap: 14 }}>
            {/*
              设计稿这一段是「最近播放」。播放历史属于 C3，在它落地之前这里展示的是
              最近添加——宁可标题与设计稿差一个词，也不拿别的数据冒充播放历史。
            */}
            <SectionHead
              title="最近添加"
              trailing="全部"
              onTrailingPress={() => router.push('/search')}
            />
            <View style={{ gap: TRACK_ROW_GAP }}>
              {recent.slice(0, RECENT_LIMIT).map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  active={playback.currentTrack?.id === track.id}
                  onPress={() => void playQueue(recent.slice(0, RECENT_LIMIT), index)}
                  onMore={() => setActionsFor(track)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <TrackActionsSheet track={actionsFor} onClose={() => setActionsFor(null)} />
    </Screen>
  );
}

/**
 * 当日精选：以日期为种子从用户自己的歌单里挑一个，每天换一次。
 *
 * 「精选」在这里指的是从你的库里选，不是编辑部推荐——产品不提供音源，
 * 也就不存在外部内容可推。同一天内反复进入发现页拿到的是同一个歌单。
 */
function dailyPick<T>(playlists: readonly T[]): T | null {
  if (playlists.length === 0) return null;
  return playlists[Math.floor(Date.now() / DAY) % playlists.length] ?? null;
}

function playlistMeta(trackCount: number, durationMs: number | null): string {
  const total = formatTotalDuration(durationMs);
  return total ? `${trackCount} 首 · ${total}` : `${trackCount} 首`;
}

function EmptyHero({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        height: 186,
        borderRadius: 20,
        backgroundColor: Colors.surface,
        padding: 16,
        justifyContent: 'flex-end',
        gap: 5,
      }}
    >
      <AppText size={11} weight="semibold" color={Colors.accent} letterSpacing={1}>
        每日精选歌单
      </AppText>
      <AppText size={26} weight="bold" letterSpacing={-0.6}>
        还没有歌单
      </AppText>
      <AppText size={12} color={Colors.textSubtle}>
        去音乐库新建一个，这里就会每天从中挑一个
      </AppText>
    </Pressable>
  );
}
