// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import { migrate } from '@/domain/db/migrations';

const DATABASE_NAME = 'ease-music.db';

let connection: Promise<SQLiteDatabase> | null = null;

async function connect(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(DATABASE_NAME);
  // 外键约束在 SQLite 中默认关闭，而歌单关联表的级联删除完全依赖它
  // （playlist spec：曲目从曲库移除时须从所有歌单中一并清除）。
  await db.execAsync('PRAGMA foreign_keys = ON');
  // WAL 让「导入时写入」与「列表滚动时读取」不互相阻塞。
  await db.execAsync('PRAGMA journal_mode = WAL');
  await migrate(db);
  return db;
}

/**
 * 获取数据库连接。首次调用时打开连接并执行迁移，后续调用复用同一个 Promise——
 * 并发调用不会打开第二个连接，也不会重复跑迁移。
 */
export function getDatabase(): Promise<SQLiteDatabase> {
  connection ??= connect().catch((error: unknown) => {
    // 失败时清空缓存，让下一次调用重新尝试，而不是永久返回同一个失败的 Promise。
    connection = null;
    throw error;
  });
  return connection;
}
