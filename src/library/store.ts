// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

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

/**
 * 按专辑或艺人聚合出的曲目集合。
 *
 * 曲库里没有「专辑」「艺人」这两张表——它们是曲目元数据的两个视角，由曲目现聚合
 * 而来。建表反而要额外维护一份随曲目增删而变的副本，而聚合的成本只与曲库规模
 * 相关，本地曲库的量级下不构成负担。
 */
export type Collection = {
  name: string;
  meta: string;
  coverUri: string | null;
  tracks: Track[];
};

export type CollectionKind = 'album' | 'artist';

export function useCollections(kind: CollectionKind): Collection[] {
  const tracks = useTracks('title', '');

  return useMemo(() => {
    const groups = new Map<string, Track[]>();
    for (const track of tracks) {
      const name = (kind === 'album' ? track.album : track.artist) ?? UNKNOWN[kind];
      const existing = groups.get(name);
      if (existing) existing.push(track);
      else groups.set(name, [track]);
    }

    return [...groups]
      .map(([name, items]) => ({
        name,
        meta: kind === 'album' ? (items[0]?.artist ?? UNKNOWN.artist) : `${items.length} 首`,
        coverUri: items.find((item) => item.artworkUri)?.artworkUri ?? null,
        tracks: items,
      }))
      .sort((a, b) => b.tracks.length - a.tracks.length);
  }, [tracks, kind]);
}

const UNKNOWN: Record<CollectionKind, string> = { album: '未知专辑', artist: '未知艺术家' };

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
