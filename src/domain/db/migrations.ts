// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * 迁移以 `PRAGMA user_version` 为游标顺序执行。
 *
 * 后续 change 会增改表结构（C2 缓存记录、C3 播放历史、C5 网盘字段），届时在数组
 * 末尾追加一项即可，**已发布的迁移不得修改**——用户设备上的数据库已按旧版本执行过。
 */
type Migration = {
  version: number;
  up: string;
};

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE tracks (
        id            TEXT    PRIMARY KEY NOT NULL,
        source_id     TEXT    NOT NULL,
        source_key    TEXT    NOT NULL,
        source_ref    TEXT    NOT NULL,
        title         TEXT    NOT NULL,
        artist        TEXT,
        album         TEXT,
        duration_ms   INTEGER,
        track_number  INTEGER,
        artwork_uri   TEXT,
        added_at      INTEGER NOT NULL,
        unavailable   INTEGER NOT NULL DEFAULT 0
      );

      -- music-library spec：同一来源、同一标识不得产生重复记录。
      -- 用唯一索引在数据库层面保证，而不是靠插入前查一次。
      CREATE UNIQUE INDEX idx_tracks_source ON tracks (source_id, source_key);
      CREATE INDEX idx_tracks_title    ON tracks (title);
      CREATE INDEX idx_tracks_artist   ON tracks (artist);
      CREATE INDEX idx_tracks_added_at ON tracks (added_at);

      CREATE TABLE playlists (
        id         TEXT    PRIMARY KEY NOT NULL,
        name       TEXT    NOT NULL,
        created_at INTEGER NOT NULL
      );

      -- design.md 决策 8：多对多关系用独立关联表表达。
      -- position 是「关系」的属性而非「曲目」的属性，因此必须落在这张表上。
      CREATE TABLE playlist_tracks (
        playlist_id TEXT    NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
        track_id    TEXT    NOT NULL REFERENCES tracks (id)    ON DELETE CASCADE,
        position    INTEGER NOT NULL,
        PRIMARY KEY (playlist_id, track_id)
      );

      CREATE INDEX idx_playlist_tracks_order ON playlist_tracks (playlist_id, position);
      CREATE INDEX idx_playlist_tracks_track ON playlist_tracks (track_id);
    `,
  },
  {
    version: 2,
    up: `
      -- add-offline-cache/design.md 决策 1：缓存是曲目的**外部**事实，独立成表而不是给
      -- tracks 加列。曲库列表的每次查询都要读全部曲目行，不该背上与曲目本身无关的字段；
      -- 而 ON DELETE CASCADE 让「曲目没了、缓存记录还在」在数据库层面无法出现。
      --
      -- 只记录**已完成**的下载（决策 7）：排队中与下载中的状态随进程生灭，落库反而要在
      -- 每次启动时把它们改回未下载。
      CREATE TABLE track_cache (
        track_id     TEXT    PRIMARY KEY NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
        file_uri     TEXT    NOT NULL,
        bytes        INTEGER NOT NULL,
        completed_at INTEGER NOT NULL
      );

      CREATE INDEX idx_track_cache_completed ON track_cache (completed_at);
    `,
  },
  {
    version: 3,
    up: `
      -- 下载到的音频**实际有多长**。它与 tracks.duration_ms 是两件事：后者是来源自述的
      -- 时长，前者是文件里真实存在的音频。两者对不上时用户才看得出来自己下到的是什么——
      -- 实测网易插件对版权受限曲目返回 30 秒试听片段，下载「成功」且响应完整，
      -- 缓存层无从判断，只能把事实摆给用户。
      --
      -- 允许为空：本列之前完成的下载没有这项数据，界面据此只显示体积。
      ALTER TABLE track_cache ADD COLUMN duration_ms INTEGER;
    `,
  },
  {
    version: 4,
    up: `
      -- add-playback-history/design.md 决策 1：播放历史同样是曲目的**外部**事实，
      -- 独立成表。理由比缓存更强——历史每切一首歌就写一次，若把「最后播放时间」写在
      -- 曲目行上，用户连着听十首就会触发十次全库重查（曲库刷新是全局广播）。
      --
      -- 每首曲目只有一行（track_id 为主键）：产品决定是「只留最近一次 + 计次数」，
      -- 不保留每次播放的流水。play_count 本次界面不展示，但记录时顺手就能维护，
      -- 事后再补则面对一个回填不了的空洞——播放次数推算不出来（决策 6）。
      CREATE TABLE playback_history (
        track_id       TEXT    PRIMARY KEY NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
        last_played_at INTEGER NOT NULL,
        play_count     INTEGER NOT NULL DEFAULT 1
      );

      -- 历史的唯一读法就是「按最后播放时间倒序」，裁剪上限时也依赖它。
      CREATE INDEX idx_playback_history_played ON playback_history (last_played_at DESC);
    `,
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

export async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;

    // 每个迁移单独成一个事务：中途失败时 user_version 不会前进，下次启动重试同一步。
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(migration.up);
      // user_version 不接受参数绑定，只能拼接；version 来自本文件的字面量，无注入面。
      await txn.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
