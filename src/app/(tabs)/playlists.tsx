// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useRouter } from 'expo-router';
import { ListMusic, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { createPlaylist } from '@/domain/repository/playlist-repository';
import { notifyLibraryChanged, usePlaylists } from '@/library/store';
import { Screen } from '@/ui/screen';
import { AppText } from '@/ui/text';
import { NameSheet } from '@/ui/name-sheet';
import { Colors, DOCK_HEIGHT } from '@/ui/theme';

/** 设计稿 Album Card：两列网格，列间距 16，行间距 18，屏幕左右内边距 20。 */
const COLUMN_GAP = 16;
const ROW_GAP = 18;

export default function PlaylistsScreen() {
  const playlists = usePlaylists();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const rows: (typeof playlists)[] = [];
  for (let index = 0; index < playlists.length; index += 2) {
    rows.push(playlists.slice(index, index + 2));
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText size={24} weight="bold">
          歌单
        </AppText>
        <Pressable onPress={() => setCreating(true)} hitSlop={10}>
          <Plus size={21} color={Colors.text} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText size={17} weight="bold">
          我的歌单
        </AppText>
        <AppText size={12} color={Colors.textMuted}>
          {playlists.length} 个
        </AppText>
      </View>

      {playlists.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <AppText size={14} color={Colors.textMuted}>
            还没有歌单
          </AppText>
          <AppText size={12} color={Colors.textMuted}>
            用右上角的 + 新建一个
          </AppText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ gap: ROW_GAP, paddingBottom: DOCK_HEIGHT }}
          showsVerticalScrollIndicator={false}
        >
          {rows.map((row) => (
            <View key={row[0]?.id} style={{ flexDirection: 'row', gap: COLUMN_GAP }}>
              {row.map((playlist) => (
                <Pressable
                  key={playlist.id}
                  onPress={() => router.push(`/playlist/${playlist.id}`)}
                  style={{ flex: 1, gap: 10 }}
                >
                  <View
                    style={{
                      aspectRatio: 1,
                      borderRadius: 16,
                      backgroundColor: Colors.surface2,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ListMusic size={34} color={Colors.textMuted} />
                  </View>
                  <AppText size={13} weight="semibold" lineHeight={1.35} numberOfLines={2}>
                    {playlist.name}
                  </AppText>
                  <AppText size={11} color={Colors.textMuted}>
                    {playlist.trackCount} 首
                  </AppText>
                </Pressable>
              ))}
              {/* 单数张卡片时补一个等宽占位，避免最后一张被拉伸到整行 */}
              {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </ScrollView>
      )}

      <NameSheet
        visible={creating}
        title="新建歌单"
        confirmLabel="创建"
        onClose={() => setCreating(false)}
        onSubmit={async (name) => {
          const playlist = await createPlaylist(name);
          if (!playlist) return '歌单名称不能为空。';
          notifyLibraryChanged();
          return null;
        }}
      />
    </Screen>
  );
}
