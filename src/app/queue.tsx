// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { clearQueue, playTrackAt, removeFromQueue } from '@/playback/player';
import { usePlayback } from '@/playback/use-playback';
import { FloatingMiniPlayer } from '@/ui/mini-player';
import { Screen } from '@/ui/screen';
import { AppText } from '@/ui/text';
import { Colors, MINI_DOCK_HEIGHT } from '@/ui/theme';
import { TRACK_ROW_GAP, TrackRow } from '@/ui/track-row';

/**
 * 播放队列。设计稿把它放在正在播放页底部的列表图标后面，因此它是一个栈内页面，
 * 而不是底部标签的目的地。
 */
export default function QueueScreen() {
  const playback = usePlayback();
  const router = useRouter();

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ChevronLeft size={24} color={Colors.text} />
        </Pressable>
        <AppText size={24} weight="bold" letterSpacing={-0.5} style={{ flex: 1 }}>
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
          contentContainerStyle={{ paddingBottom: MINI_DOCK_HEIGHT }}
          ItemSeparatorComponent={() => <View style={{ height: TRACK_ROW_GAP }} />}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <TrackRow
              track={item}
              active={index === playback.currentIndex}
              onPress={() => void playTrackAt(index)}
              trailing={
                <Pressable onPress={() => void removeFromQueue(index)} hitSlop={10}>
                  <X size={18} color={Colors.textMuted} />
                </Pressable>
              }
            />
          )}
        />
      )}

      <FloatingMiniPlayer />
    </Screen>
  );
}
