## 1. 数据层

- [x] 1.1 在 `src/domain/db/migrations.ts` 末尾追加 `version: 4`，建 `playback_history` 表（`track_id` 主键、外键 `REFERENCES tracks(id) ON DELETE CASCADE`，`last_played_at`、`play_count`）与按 `last_played_at` 的索引；不改动既有迁移的任何语句
- [x] 1.2 新建 `src/history/repository.ts`：写入一次播放（UPSERT——已存在则更新最后播放时间并累加次数）、按最后播放时间倒序列出曲目、清空全部、统计条数
- [x] 1.3 在写入之后裁剪到保留上限（常量 200，design 决策 3），裁剪须幂等——两次快速切歌导致它多跑一次不能有副作用

## 2. 记录时机

- [x] 2.1 `src/playback/player.ts` 的 `load()`：在 `player.replace(...)` 成功之后、**仅当 `autoPlay` 为真**时记一笔（design 决策 2）。不 await、不进 try/catch 的失败分支
- [x] 2.2 记录函数内部自行吞掉异常（design 决策 4）：写库失败绝不能走到 `handleLoadFailure`——那会跳曲、累加连续失败计数，甚至把曲目标记为失效
- [x] 2.3 确认既有的 `token !== loadToken` 守卫使「装载中途用户又切歌」不留下记录；不新增守卫，只在注释里写明依赖了它
- [x] 2.4 确认 `togglePlayPause` 与 loopOne 自然循环（`advance` 走 `seekTo(0)`）都不经过记录点——暂停续播与单曲循环不应虚涨播放次数

## 3. 界面

- [x] 3.1 `src/app/(tabs)/index.tsx`：「最近添加」改为「最近播放」，接上真实历史数据，并删除 C1 留下的那条「播放历史属于 C3」的占位注释
- [x] 3.2 历史为空时回退到「最近添加」，标题随之变化（design 决策 5）——新用户首屏不能开天窗
- [x] 3.3b 曲目行的「更多」菜单增加「从最近播放移除」，仅当该行来自最近播放区块时渲染（design 决策 7）；副文案与紧邻的「从曲库移除」区分清楚
- [x] 3.3 `src/app/(tabs)/profile.tsx` 增加「播放历史」一行，显示已记录条数，点击清空前给出确认，并说明「只清除播放记录，曲库中的曲目一首不少」
- [x] 3.4 播放 / 清空 / 移除曲目后发现页即时刷新。**不沿用 `notifyLibraryChanged`**（原任务文字如此，实施时否掉）：那是全库广播，挂上去等于用户连听十首触发十次全库重查，正是 design 决策 1 拒绝把「最后播放时间」写进 `tracks` 的理由。改为 `src/history/store.ts` 的窄播，三个改动入口各发一次

## 4. 曲目移除与历史的联动

- [x] 4.1 验证 `removeTrackFromLibrary` 移除曲目后其历史记录随外键 CASCADE 消失；`src/library/actions.ts` 若无需改代码，则在其文档注释里把「播放记录」补进「应用自己产生的派生物」那一条

## 5. 文档与检查

- [x] 5.1 `docs/architecture.md` 增补 `src/history` 一节：它与 `src/cache` 同属「曲目的外部事实」这一类，说明为什么不塞进 `tracks`
- [x] 5.2 `README.md` 更新路线图中 C3 的状态与项目结构
- [x] 5.3 `openspec/PRODUCT.md`：C3 拆成 C3（播放历史）与 C3b（歌词）两行，功能地图里的「歌词显示」改标 C3b，并加一段拆分说明
- [x] 5.4 跑 `pnpm lint`、`pnpm typecheck`、`pnpm check:constraints`

## 6. 验收（Android）

> 按 PRODUCT.md 的验收策略，本次只在 Android 上验收；iOS 侧留待全量验收。本能力无平台差异。

- [x] 6.1 播放一首曲目 → 发现页区块标题自动从「最近添加」变为「最近播放」，该曲目排在最前
- [x] 6.2 再播同一首 →`play_count` 1→2，跳回最前，总行数不变（仍 3 行）
- [x] 6.3 断网播一首未下载的插件曲目 → 解析失败，历史中 0 条；失败后自动跳到的下一首被正确记录
- [x] 6.4 清空队列后用「加入播放队列」预装载（`autoPlay: false`）→ 该曲目**未**进入历史
- [x] 6.5 暂停后继续播放两次 → `play_count` 不变
- [x] 6.6 单曲循环一首 7 秒的曲目约 50 秒（≈7 遍）→ `play_count` 仍为 **1**，与 design Risks 的预期一致（loopOne 走 `seekTo(0)` 不经过 `load()`）
- [x] 6.7 从最近播放**移除单条记录** → 历史 0 行，`tracks` 仍 12 首、双截棍仍在曲库、其缓存记录与磁盘上的 mp3 均在；发现页即时回落到「最近添加」；重新播放该曲目 → 重新入历史且 `play_count` 从 1 计起
- [x] 6.7b 从**曲库**移除一首近期播放过的曲目（`msf:21`，用户授权）→ 曲目 12→11、历史 3→2 行、**孤儿历史行 0**（证明 `PRAGMA foreign_keys = ON` 确实生效，CASCADE 真的执行而非靠代码补删）；Downloads 目录 8 个文件与总字节数一字未变；移除时它正在播放，应用未崩溃。验毕已把该曲目重新导入还原
- [x] 6.8 清空播放历史 → `playback_history` 0 行，`tracks` 仍 12、`track_cache` 仍 2，发现页即时回到「最近添加」
- [x] 6.9 历史为空时打开发现页 → 显示「最近添加」，非空白（迁移后与清空后各验一次）
- [x] 6.10 临时把 `HISTORY_LIMIT` 调到 3 后播一首 → 历史从 9 行裁到 3 行，保留最近三首，`tracks` 仍 12 首；验毕已恢复为 200

### 验证中确认的事

- **迁移 v4 在既有数据库上生效**：`PRAGMA user_version` 2→4（本次跨过 3，因设备上已是 3），`playback_history` 建表成功，12 首曲目与 2 条缓存记录无损
- **自动推进也算一次播放**：30 秒试听片段播完自动续播下一首时，下一首被正确记入历史——`advance` 走 `load(autoPlay: true)`，与手动切歌同一条路径
- **失败跳曲的边界正确**：解析失败的曲目不记录，而 `handleLoadFailure` 跳过去的那一首记录
