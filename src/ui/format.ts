// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { Track } from '@/domain/model/track';

/** 单曲时长：`3:42`。 */
export function formatDuration(ms: number): string {
  const total = Math.max(Math.round(ms / 1000), 0);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * 合计时长：设计稿写作「2 小时 14 分」。不足一小时只报分钟，
 * 时长缺失（曲目未解析出时长）时返回 null，由调用方决定省略这一段。
 */
export function formatTotalDuration(ms: number | null): string | null {
  if (!ms || ms <= 0) return null;

  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} 小时 ${minutes % 60} 分` : `${minutes} 分`;
}

const DAY = 86400000;

/** 相对日期：设计稿卡片副标题的「今天 / 4 天前 / 上周 / 3 周前」。 */
export function formatRelativeDay(timestamp: number, now = Date.now()): string {
  const days = Math.max(Math.floor((now - timestamp) / DAY), 0);

  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  if (days < 14) return '上周';
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

/** 星期 + 时段问候，发现页顶部的 eyebrow。 */
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export function formatGreeting(date = new Date()): { eyebrow: string; title: string } {
  const hour = date.getHours();
  const period =
    hour < 5
      ? '深夜好'
      : hour < 11
        ? '早上好'
        : hour < 14
          ? '中午好'
          : hour < 18
            ? '下午好'
            : '晚上好';

  return {
    eyebrow: `${WEEKDAYS[date.getDay()]} ${period}`,
    title: hour >= 18 || hour < 5 ? '今晚听点什么' : '今天听点什么',
  };
}

/**
 * 曲目副标题。失效时把原因摆在艺人的位置上——media-source spec 要求用户能看出
 * 发生了什么，而不是发现一首歌莫名其妙点不响。
 */
export function trackSubtitle(track: Track, withDuration = false): string {
  if (track.unavailable) return '文件已失效，无法播放';

  const artist = track.artist ?? '未知艺术家';
  if (!withDuration || !track.durationMs) return artist;
  return `${artist} · ${formatDuration(track.durationMs)}`;
}
