// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useEffect, useState, useSyncExternalStore } from 'react';

import type { Playlist } from '@/domain/model/playlist';
import { listPlaylists } from '@/domain/repository/playlist-repository';
import type { Track, TrackSortKey } from '@/domain/model/track';
import { listTracks } from '@/domain/repository/track-repository';

/**
 * 曲库变更的广播。
 *
 * 数据的真相在 SQLite 里，界面只是它的一个视图。与其在各个页面之间传回调，
 * 不如让写操作统一发一次「变了」，各页面自行重查——页面越多这个做法越省事，
 * 也不会出现某个入口忘了通知导致列表不刷新。
 */
let revision = 0;
const listeners = new Set<() => void>();

export function notifyLibraryChanged(): void {
  revision += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useRevision(): number {
  return useSyncExternalStore(
    subscribe,
    () => revision,
    () => revision,
  );
}

export function useTracks(sortBy: TrackSortKey, keyword: string): Track[] {
  const revision = useRevision();
  const [tracks, setTracks] = useState<Track[]>([]);

  useEffect(() => {
    let current = true;
    void listTracks({ sortBy, keyword }).then((result) => {
      if (current) setTracks(result);
    });
    return () => {
      current = false;
    };
  }, [sortBy, keyword, revision]);

  return tracks;
}

export function usePlaylists(): Playlist[] {
  const revision = useRevision();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    let current = true;
    void listPlaylists().then((result) => {
      if (current) setPlaylists(result);
    });
    return () => {
      current = false;
    };
  }, [revision]);

  return playlists;
}

/** 通用的「跟随曲库变更重查」封装，供歌单详情等按 id 取数的页面使用。 */
export function useLibraryQuery<T>(query: () => Promise<T>, deps: readonly unknown[]): T | null {
  const revision = useRevision();
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    let current = true;
    void query().then((result) => {
      if (current) setValue(result);
    });
    return () => {
      current = false;
    };
    // query 每次渲染都是新引用，依赖由调用方通过 deps 显式声明
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, revision]);

  return value;
}
