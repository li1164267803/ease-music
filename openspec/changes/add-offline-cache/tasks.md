## 1. 数据层

- [x] 1.1 在 `src/domain/db/migrations.ts` 末尾追加 `version: 2`，建 `track_cache` 表（`track_id` 主键、外键 `REFERENCES tracks(id) ON DELETE CASCADE`，`file_uri`、`bytes`、`completed_at`），不改动 version 1 的任何语句
- [x] 1.1b 追加 `version: 3`：给 `track_cache` 加可空列 `duration_ms`，记录缓存音频的**实际**时长（design 决策 11）。查询时必须起别名——`tracks` 也有一列叫 `duration_ms`，`t.*` 展开后会相撞，不起别名读到的是曲目自述的时长，正好是要区分的那个值
- [x] 1.2 新建 `src/cache/repository.ts`：读取单曲缓存记录、列出全部缓存记录、写入完成记录、删除单条记录、删除全部记录、统计总占用（`getCacheUsage`）
- [x] 1.3 为「列出已下载曲目」提供查询（`track_cache` join `tracks`，供曲库已下载分类使用）

## 2. 缓存文件与下载执行

- [x] 2.1 新建 `src/cache/files.ts`：缓存目录（`document/cache-audio/` 与其下 `.partial/`）的按需创建、缓存文件路径推导（`<track.id>.<ext>`）、扩展名推断、删除单个缓存文件
- [x] 2.2 在 `files.ts` 中实现启动清理：清空 `.partial/` 整个目录，并删除不在缓存记录集合中的孤儿文件（形态参照 `src/library/artwork.ts` 的 `pruneArtwork`）
- [x] 2.3 新建 `src/cache/download.ts`：单曲下载执行。轮到执行时才调 `getSource(track.sourceId).resolve(track)` 取地址，把 `headers` 与 `userAgent` 原样传给 `File.createDownloadTask`；下载到 `.partial/<track.id>`，成功后 `moveSync` 到最终路径，**文件就位后**再写数据库记录（design 决策 3）
- [x] 2.4 下载失败 / 被取消时删除 `.partial` 中的残留文件，并把失败原因转成面向用户的中文说明（区分网络失败、HTTP 非 2xx、存储空间不足、地址解析失败）

## 3. 下载队列与状态

- [x] 3.1 新建 `src/cache/queue.ts`：并发度 1 的串行队列，支持入队单曲、入队一批、取消单曲、取消全部；每个任务持有自己的 `AbortController`
- [x] 3.2 内存态与订阅广播落在 `src/cache/store.ts`（与队列分开，理由见 design 决策 10）：曲目下载状态为 `未下载 | 等待中 | 下载中(bytesWritten/totalBytes) | 已下载 | 失败(原因)`，进行中的状态不落库（design 决策 7）
- [x] 3.3 入队时跳过已下载的曲目与来源声明不可缓存的曲目；下载完成后触发 `notifyLibraryChanged`，让已下载分类与占用统计刷新
- [x] 3.4 提供 `useTrackCacheState(trackId)`（`store.ts`）与 `useDownloadQueue()`（`queue.ts`）两个 Hook 供界面订阅

## 4. 解析拦截与来源契约

- [x] 4.1 在 `src/sources/contract.ts` 的 `MediaSource` 上增加可选只读字段 `cacheable?: boolean`（缺省视为 `true`），并补充文档说明；同时澄清 `resolve` 上「不缓存结果」的注释——不缓存的是**地址**，音频字节的缓存是 C2 的能力，二者不冲突
- [x] 4.2 `src/sources/local-file` 声明 `cacheable: false`
- [x] 4.3 在 `src/sources/resolve.ts` 中加入缓存拦截：命中且文件存在则直接返回 `{ uri }`（不带 headers）；命中但文件已不存在则删除记录后继续走来源解析，不报错（design 决策 4、8）
- [x] 4.4 在 `src/app/_layout.tsx` 的启动流程中调用一次缓存启动清理（2.2）

## 5. 曲目移除与缓存的联动

- [x] 5.1 `src/library/actions.ts` 的 `removeTrackFromLibrary`：移除曲目时取消其进行中的下载任务，并删除其缓存文件与记录（必须在删除曲目行**之前**做，否则外键 CASCADE 会先带走记录，文件路径无从查起）
- [x] 5.2 更新该函数的文档注释，写明「用户的原始文件不动」与「应用自己产生的派生文件（缓存音频、封面）要清」这条区分

## 6. 界面：下载入口与状态

- [x] 6.1 新建 `src/cache/ui/download-button.tsx`：按曲目状态呈现未下载 / 等待中 / 下载中（进度）/ 已下载 / 失败，并处理点击（发起下载、重试、取消）；来源不可缓存时整个不渲染
- [x] 6.2 播放页 `src/app/player.tsx` 接入下载按钮，并在下载失败时显示原因（只有图标说明不了是断网还是地址失效）
- [x] 6.2b 曲目行 `src/ui/track-row.tsx` 接入下载按钮（发现页「最近添加」、搜索页「全部曲目」）。proposal 的「曲目行、播放页、歌单页」里的第一项，初版漏做——而插件搜索的结果加入曲库后，用户落脚的正是这种行
- [x] 6.3 歌单详情 `src/app/playlist/[id].tsx` 接入单曲下载状态（经 `IndexedTrackRow`），并接上歌单整批下载（替换当前「收藏与下载」的占位注释）
- [x] 6.4 批量下载的整体进度与结果提示：完成后告知成功数量，若有失败则列出失败的曲目

## 7. 界面：已下载分类与缓存管理

- [x] 7.1 `src/app/(tabs)/library.tsx` 的 `downloaded` 分类接上真实数据，移除「离线缓存将在后续版本提供」的占位文案，并给出无内容时的空状态说明
- [x] 7.2 新建缓存管理界面（路由 `src/app/downloads.tsx`）：显示总占用与曲目数、按曲目列出已下载内容的**实际时长与体积**、支持删除单曲缓存与清空全部缓存
- [x] 7.2b 下载完成后用 `parseAudioMetadata` 读一次缓存文件的实际时长并存入记录；解析失败返回 null 且**不让下载失败**（文件已完整落盘，读不出时长只是少一项展示）。魔数嗅探下沉到 `src/domain/audio-format.ts`，与曲库元数据解析共用一份实现
- [x] 7.3 「我的」页 `src/app/(tabs)/profile.tsx` 增加缓存管理入口（`Download` 已被「导入音乐」占用，改用 `HardDrive`）
- [x] 7.4 清空全部缓存前给出确认，并说明「只删除已下载的音频，曲库中的曲目一首不少」

## 8. 文档与检查

- [x] 8.1 `docs/architecture.md` 增补 `src/cache` 一节：模块横跨两层的切法、拦截点位置、三种不一致各自的发现与纠正方式
- [x] 8.2 `README.md` 更新路线图中 C2 的状态与项目结构
- [x] 8.3 `openspec/PRODUCT.md` 更新 C2 的状态
- [x] 8.4 跑 `pnpm lint`、`pnpm typecheck`、`pnpm check:constraints`（已把 `src/cache` 加入受检核心路径）、`pnpm check:ios-strip`——四项全绿，iOS 产物构成不受影响

## 9. 验收

已在 **Android 模拟器（Medium Phone API 36 / Android 16）** 上跑过一轮，结果见下。
**iOS 侧一项未跑**；标记为 Android-only 的条目在 iOS 上仍需复验。

- [x] 9.1 下载一首插件曲目（网易音乐来源的「稻香」，7,360,305 字节）→ 断网 → 播放成功。`remote-url` 曲目走同一条路径，同样通过
- [ ] 9.2 下载一首插件曲目 → 卸载该插件 → 播放成功（来源不可用时播放已下载曲目）
- [x] 9.3 下载过程中断网 → 报告失败、回到未下载、`.partial` 与最终目录均无残留（**Android 已验，iOS 未跑**）。断网前 `.partial` 中实测到 4,519,500 字节的半截文件，断网后两处目录均清空——决策 3 的临时目录确实拦住了 Android 的部分写入
- [ ] 9.4 下载中途杀掉应用 → 重开后该曲目为未下载，可重新下载，磁盘无残留。**结论不成立**：限速到 57 KB/s 后杀进程，重启后磁盘与数据库确实干净，但没能确认杀进程那一刻下载真的在传输中，不算验过
- [x] 9.5 手动删除缓存文件后播放该曲目 → 回退到来源解析并正常播放、无报错、记录被懒清理、下载状态更正为未下载（Android）
- [ ] 9.6 歌单整批下载 → 中途某首失败 → 其余继续完成，结果提示列出失败曲目（当前曲库里没有歌单，未验）
- [ ] 9.7 移除一首已下载曲目 → 缓存文件消失、总占用减少；本地文件曲目移除后原文件仍在（会删掉曲库中的真实数据，未执行）
- [x] 9.8 清空全部缓存 → 文件删净、`track_cache` 清零、`tracks` 10 首一首不少（Android）
- [x] 9.9 本地文件曲目不出现下载入口（Android）。搜索页 10 首一屏内同时验证：插件曲目「稻香」显示已下载对勾、「想你就写信」显示下载箭头、`remote-url` 曲目显示下载箭头，其余 7 首 `local-file` 只有「更多」，无下载图标
- [ ] 9.10 下载一首服务端不返回 `Content-Length` 的曲目 → 进度退化为「已下载 X MB」而非卡住（测试用的地址带 `Content-Length`，走的是百分比分支，缺失分支未覆盖）
- [x] 9.11 失败后重试 → 重新下载成功，文件完整（Android）
- [x] 9.12 迁移 version 2 在真实设备上执行 → `PRAGMA user_version = 2`，`track_cache` 可读写，既有 10 首曲目与歌单数据无损

### 验证中发现并已修复

- **下载「成功」但只拿到 30 秒试听片段**。网易插件对版权受限曲目返回的是试听地址——HTTP 200、响应体完整、下载确实成功，缓存层没有任何理由认为出了问题，界面上和整首歌一样是绿勾。实测「双截棍 (Live)」下到 480,813 字节 / 实际 30.0 秒，而「稻香」是 7,360,305 字节 / 183.9 秒。已改：`track_cache` 增加 `duration_ms`（迁移 v3），缓存管理界面显示 `0:30 · 470 KB` 与 `3:04 · 7.0 MB`。**不做「这是不是片段」的判断**，理由见 design 决策 11——来源自述的时长本身就不可靠，拿它比对只会误判。
- **曲目行没有下载入口**。proposal 的 What Changes 写明「曲目行、播放页、歌单页」，初版只做了后两处。而插件搜索的结果加入曲库后，用户看到的就是发现页 / 搜索页里的曲目行——要下载得先点开播放页。已补：`TrackRow` 行尾默认渲染「下载 + 更多」，传了 `trailing` 的场景（播放队列、缓存管理）不叠加。
- **下载失败原因从不显示**。原因字符串被算出来存进了状态，但播放页只渲染一个警告图标、歌单页只列失败曲目的标题，`网络连接中断，下载未能完成。` 这句话没有任何落点——违反 spec「下载失败时系统 SHALL 向用户说明失败原因，MUST NOT 静默失败」。已改：`DownloadQueueSnapshot.failed` 改为携带 `{ title, reason }`，播放页在动作区下方显示原因与重试提示，歌单页在只失败一首时说全原因。静态检查抓不到这类缺口。
