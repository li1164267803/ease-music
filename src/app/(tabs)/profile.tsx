// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import {
  ChevronRight,
  Download,
  HardDrive,
  ListOrdered,
  Puzzle,
  Repeat,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { getCacheUsage } from '@/cache/repository';
import { PLAY_MODE_LABELS, PLAY_MODES } from '@/domain/model/playback';
import { useCollections, useLibraryQuery, usePlaylists } from '@/library/store';
import { setPlayMode } from '@/playback/player';
import { usePlayback } from '@/playback/use-playback';
import { Plugins } from '@/plugins';
import { formatBytes } from '@/ui/format';
import { ImportSheet } from '@/ui/import-sheet';
import { Screen } from '@/ui/screen';
import { AppText } from '@/ui/text';
import { Colors, DOCK_HEIGHT } from '@/ui/theme';

/**
 * 我的。设计稿的标签栏画了这个目的地但没有画屏——这里按设计稿的卡片语言收纳
 * 曲库概览、与播放相关的设置，以及产品定位要求必须露出的免责声明。
 */
export default function ProfileScreen() {
  const router = useRouter();
  const playback = usePlayback();

  const playlists = usePlaylists();
  const albums = useCollections('album');
  const trackCount = albums.reduce((total, album) => total + album.tracks.length, 0);

  const usage = useLibraryQuery(() => getCacheUsage(), []);

  const [importing, setImporting] = useState(false);

  const cycleMode = () => {
    const index = PLAY_MODES.indexOf(playback.playMode);
    const nextMode = PLAY_MODES[(index + 1) % PLAY_MODES.length];
    if (nextMode) void setPlayMode(nextMode);
  };

  return (
    <Screen>
      <AppText size={24} weight="bold" letterSpacing={-0.5}>
        我的
      </AppText>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 18, paddingBottom: DOCK_HEIGHT }}
      >
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: Colors.surface,
            borderRadius: 18,
            paddingVertical: 18,
          }}
        >
          <Stat value={trackCount} label="曲目" />
          <Stat value={playlists.length} label="歌单" />
          <Stat value={albums.length} label="专辑" />
        </View>

        <View style={{ backgroundColor: Colors.surface, borderRadius: 18, overflow: 'hidden' }}>
          <Row
            Icon={Repeat}
            label="播放模式"
            value={PLAY_MODE_LABELS[playback.playMode]}
            onPress={cycleMode}
          />
          <Row
            Icon={ListOrdered}
            label="播放队列"
            value={playback.queue.length > 0 ? `${playback.queue.length} 首` : '空'}
            onPress={() => router.push('/queue')}
          />
          <Row Icon={Download} label="导入音乐" onPress={() => setImporting(true)} />
          {/*
            这一行与上一行只隔一格，图标必须区分得开：`Download` 已被「导入音乐」占用，
            这里用存储介质的图标——它表达的本来也是「占了多少地方」。
          */}
          <Row
            Icon={HardDrive}
            label="已下载"
            value={
              usage && usage.count > 0 ? `${usage.count} 首 · ${formatBytes(usage.bytes)}` : '无'
            }
            onPress={() => router.push('/downloads')}
          />
          {/*
            插件入口只在具备插件能力的平台上存在。iOS 侧 `supported` 恒为 false，
            这一行整个不渲染——plugin-source spec 要求 iOS 上不存在任何插件相关入口，
            而不是渲染一个「不可用」的入口。
          */}
          {Plugins.supported ? (
            <Row Icon={Puzzle} label="插件音源" onPress={() => router.push('/plugins')} />
          ) : null}
        </View>

        <View style={{ backgroundColor: Colors.surface, borderRadius: 18, padding: 18, gap: 10 }}>
          <AppText size={14} weight="semibold">
            自在音乐 EaseMusic
          </AppText>
          <AppText size={12} color={Colors.textMuted}>
            版本 {Constants.expoConfig?.version ?? '—'} · GPL-3.0-or-later
          </AppText>
          <AppText size={12} color={Colors.textMuted} lineHeight={19}>
            {
              '本应用不提供任何音源，只播放你自己拥有或自己指定的资源。设备上的原文件不会被应用改动或删除。'
            }
          </AppText>
        </View>
      </ScrollView>

      <ImportSheet visible={importing} onClose={() => setImporting(false)} />
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <AppText size={22} weight="bold">
        {value}
      </AppText>
      <AppText size={11} color={Colors.textMuted}>
        {label}
      </AppText>
    </View>
  );
}

function Row({
  Icon,
  label,
  value,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 15,
        paddingHorizontal: 18,
      }}
    >
      <Icon size={18} color={Colors.textMuted} />
      <AppText size={14} weight="medium" style={{ flex: 1 }}>
        {label}
      </AppText>
      {value ? (
        <AppText size={12} color={Colors.textMuted}>
          {value}
        </AppText>
      ) : null}
      <ChevronRight size={16} color={Colors.textMuted} />
    </Pressable>
  );
}
