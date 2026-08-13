// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { ArrowDownToLine, CircleCheck, Hourglass, TriangleAlert } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { isTrackCacheable } from '@/cache/download';
import { cancelDownload, enqueueDownloads } from '@/cache/queue';
import { useTrackCacheState } from '@/cache/store';
import type { Track } from '@/domain/model/track';
import { formatBytes } from '@/ui/format';
import { AppText } from '@/ui/text';
import { Colors, IconSize } from '@/ui/theme';

/**
 * 曲目的下载入口与状态。
 *
 * 五种状态各有各的动作，因此不拆成「按钮 + 状态」两个组件——点一下要做什么完全由
 * 当前状态决定，拆开只会把这层判断挪到调用方，每个用到它的页面重写一遍。
 *
 * 组件自己发起下载与取消，不向外要回调：下载是全局队列上的操作，页面无从参与。
 */
export function DownloadButton({ track, size = IconSize.sm }: { track: Track; size?: number }) {
  const state = useTrackCacheState(track.id);

  // offline-cache spec：音频本就在设备上的曲目不提供下载入口。
  // 渲染一个不可用的按钮不算「不提供」，整个不渲染才是。
  if (!isTrackCacheable(track)) return null;

  const press = () => {
    if (state.status === 'idle' || state.status === 'failed') enqueueDownloads([track]);
    else if (state.status === 'queued' || state.status === 'downloading') cancelDownload(track.id);
  };

  return (
    <Pressable
      onPress={press}
      disabled={state.status === 'downloaded'}
      hitSlop={10}
      accessibilityLabel={LABELS[state.status]}
      // 固定宽度：进度百分比在 9% 与 99% 之间会变宽，不定住会让整行左右抖动
      style={{ minWidth: size + 14, alignItems: 'center', justifyContent: 'center' }}
    >
      <StateIcon state={state} size={size} />
    </Pressable>
  );
}

const LABELS: Record<ReturnType<typeof useTrackCacheState>['status'], string> = {
  idle: '下载到本地',
  queued: '等待下载，点击取消',
  downloading: '正在下载，点击取消',
  downloaded: '已下载',
  failed: '下载失败，点击重试',
};

function StateIcon({
  state,
  size,
}: {
  state: ReturnType<typeof useTrackCacheState>;
  size: number;
}) {
  switch (state.status) {
    case 'downloading':
      return (
        <AppText size={11} weight="medium" color={Colors.accent}>
          {progressLabel(state.bytesWritten, state.totalBytes)}
        </AppText>
      );
    case 'queued':
      return <Hourglass size={size} color={Colors.textMuted} />;
    case 'downloaded':
      return <CircleCheck size={size} color={Colors.accent} />;
    case 'failed':
      return <TriangleAlert size={size} color={Colors.danger} />;
    default:
      return (
        <View>
          <ArrowDownToLine size={size} color={Colors.textMuted} />
        </View>
      );
  }
}

/**
 * 服务端不给 `Content-Length` 时 `totalBytes` 为 -1，算不出百分比，退回报已下载的体积。
 * 有总长时也不显示 100%——那一刻还要移动文件、写记录，显示 100% 却还没变成「已下载」
 * 反而像是卡住了。
 */
function progressLabel(bytesWritten: number, totalBytes: number): string {
  if (totalBytes <= 0) return formatBytes(bytesWritten);
  return `${Math.min(Math.round((bytesWritten / totalBytes) * 100), 99)}%`;
}
