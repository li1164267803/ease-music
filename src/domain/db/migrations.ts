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
