// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useRouter } from 'expo-router';
import { ChevronLeft, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { deleteAllDownloads, deleteDownload } from '@/cache/queue';
import { listDownloadedTracks, type DownloadedTrack } from '@/cache/repository';
import { useLibraryQuery } from '@/library/store';
import { playQueue } from '@/playback/player';
import { formatBytes, formatDuration } from '@/ui/format';
import { FloatingMiniPlayer } from '@/ui/mini-player';
import { Screen } from '@/ui/screen';
import { Sheet, SheetAction } from '@/ui/sheet';
import { AppText } from '@/ui/text';
import { Colors, MINI_DOCK_HEIGHT } from '@/ui/theme';
import { TrackRow, TRACK_ROW_GAP } from '@/ui/track-row';

/**
 * 缓存管理。
 *
 * offline-cache spec 把容量治理完全交给用户：应用只负责把占用摊开给他看，
 * 从不因为空间紧张、总量超阈值或长期未播而自行删除任何一首。这个页面就是那个「摊开」。
 */
export default function DownloadsScreen() {
  const router = useRouter();

  const downloaded = useLibraryQuery(() => listDownloadedTracks(), []) ?? [];
  const [clearing, setClearing] = useState(false);

  // 总占用由这份列表直接加出来，不再单独查一次聚合——列表已经把每首的体积带回来了。
  const totalBytes = downloaded.reduce((sum, item) => sum + item.bytes, 0);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ChevronLeft size={24} color={Colors.text} />
        </Pressable>
        <AppText size={24} weight="bold" letterSpacing={-0.5} style={{ flex: 1 }}>
          已下载
        </AppText>
        {downloaded.length > 0 ? (
          <Pressable onPress={() => setClearing(true)} hitSlop={10}>
            <AppText size={13} color={Colors.textMuted}>
              清空
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: 'row',
          backgroundColor: Colors.surface,
          borderRadius: 18,
          paddingVertical: 18,
        }}
      >
        <Stat value={`${downloaded.length}`} label="首" />
        <Stat value={formatBytes(totalBytes)} label="占用空间" />
      </View>

      {downloaded.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <AppText size={13} color={Colors.textMuted}>
            还没有下载任何曲目
          </AppText>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: TRACK_ROW_GAP, paddingBottom: MINI_DOCK_HEIGHT }}
          showsVerticalScrollIndicator={false}
        >
          {downloaded.map((item, index) => (
            <TrackRow
              key={item.track.id}
              track={item.track}
              onPress={() =>
                void playQueue(
                  downloaded.map((entry) => entry.track),
                  index,
                )
              }
              trailing={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <AppText size={12} color={Colors.textMuted}>
                    {describeFile(item)}
                  </AppText>
                  <Pressable onPress={() => void deleteDownload(item.track.id)} hitSlop={10}>
                    <Trash2 size={18} color={Colors.textMuted} />
                  </Pressable>
                </View>
              }
            />
          ))}
        </ScrollView>
      )}

      <Sheet visible={clearing} title="清空已下载内容" onClose={() => setClearing(false)}>
        <SheetAction
          label={`删除全部 ${downloaded.length} 首的音频文件`}
          hint="只删除已下载的音频，曲库中的曲目一首不少，联网后仍可正常播放"
          danger
          onPress={() => {
            void deleteAllDownloads();
            setClearing(false);
          }}
        />
      </Sheet>

      <FloatingMiniPlayer />
    </Screen>
  );
}

/**
 * 下载到的文件是什么：`3:04 · 7.4 MB`。
 *
 * 时长报的是**文件里实际有多长**，不是曲目自述的时长。这一列存在的理由很具体：
 * 来源有时给的不是整首——实测网易插件对版权受限曲目返回 30 秒试听片段，HTTP 200、
 * 响应完整，下载确实成功了，缓存层无从判断。应用不去猜「这是不是片段」（曲目自述的
 * 时长本身就有不可靠的来源，拿来比对只会误判），只把文件的事实摆出来，
 * `0:30 · 480 KB` 和 `3:04 · 7.4 MB` 并排一放，用户自己就看出来了。
 */
function describeFile({ durationMs, bytes }: DownloadedTrack): string {
  const size = formatBytes(bytes);
  return durationMs ? `${formatDuration(durationMs)} · ${size}` : size;
}

function Stat({ value, label }: { value: string; label: string }) {
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
