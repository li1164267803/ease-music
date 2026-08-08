// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { FlashList } from '@shopify/flash-list';
import { X } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { clearQueue, playTrackAt, removeFromQueue } from '@/playback/player';
import { usePlayback } from '@/playback/use-playback';
import { Artwork } from '@/ui/artwork';
import { Screen } from '@/ui/screen';
import { AppText } from '@/ui/text';
import { Colors, DOCK_HEIGHT } from '@/ui/theme';
import { formatDuration, TRACK_ROW_HEIGHT } from '@/ui/track-row';

export default function QueueScreen() {
  const playback = usePlayback();

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText size={24} weight="bold">
          播放队列
        </AppText>
        {playback.queue.length > 0 ? (
          <Pressable onPress={clearQueue} hitSlop={10}>
            <AppText size={12} color={Colors.textMuted}>
              清空
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {playback.queue.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <AppText size={14} color={Colors.textMuted}>
            队列是空的
          </AppText>
        </View>
      ) : (
        <FlashList
          data={[...playback.queue]}
          keyExtractor={(track) => track.id}
          contentContainerStyle={{ paddingBottom: DOCK_HEIGHT }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const active = index === playback.currentIndex;
            return (
              <Pressable
                onPress={() => void playTrackAt(index)}
                style={{
                  height: TRACK_ROW_HEIGHT,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 13,
                  paddingHorizontal: 10,
                  borderRadius: 14,
                  backgroundColor: active ? Colors.accentSoft : 'transparent',
                }}
              >
                <Artwork uri={item.artworkUri} size={50} radius={12} />
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText
                    size={14}
                    weight="medium"
                    color={active ? Colors.accent : Colors.text}
                    numberOfLines={1}
                  >
                    {item.title}
                  </AppText>
                  <AppText size={12} color={Colors.textMuted} numberOfLines={1}>
                    {item.artist ?? '未知艺术家'}
                    {item.durationMs ? ` · ${formatDuration(item.durationMs)}` : ''}
                  </AppText>
                </View>
                <Pressable onPress={() => void removeFromQueue(index)} hitSlop={10}>
                  <X size={18} color={Colors.textMuted} />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}
