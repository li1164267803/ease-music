## 1. Spike：用样本插件核对五个方法的真实返回形状

- [x] 1.1 在 Android 模拟器上，对已安装的样本插件依次调用 `getTopLists`、`getTopListDetail`、`getRecommendSheetTags`、`getRecommendSheetsByTag`、`getMusicSheetInfo`，把每个方法的实际返回形状（顶层字段、曲目所在字段、`isEnd` 是否给、封面字段名是 `coverImg` 还是 `artwork`）记进本文件末尾的「Spike 记录」；与 design 的协议表不一致之处在此处注明，并回写 design 的 Open Questions
- [x] 1.2 确认样本插件里至少有一个实现了榜单、至少有一个实现了推荐歌单；没有的话在实施前另行取得样本，验收项 6.x 依赖它们

## 2. 能力判定与协议校验

- [x] 2.1 `src/plugins/protocol.ts`：`PluginMeta` 增加 `canBrowseTopLists` 与 `canBrowseSheets` 两个布尔，注释说明判据分别是实现了 `getTopLists` / `getRecommendSheetTags`（design 决策 1）
- [x] 2.2 `src/plugins/host/loader.ts`：与 `canResolveMedia` 同一处按方法存在与否计算这两个布尔
- [x] 2.3 `src/plugins/manager.ts`：新增 `discoveryPlugins()`，返回两者至少其一为真的已加载插件；`PluginSummary` 不改（界面不需要按插件展示这两个能力）
- [x] 2.4 新建 `src/plugins/discovery.ts`：定义 `DiscoveryItem`（`id`、`title`、`artworkUri`、`description`、`raw`）、`DiscoveryTag`（`id`、`title`、`raw`）与分组类型；`id` 与 `title` 缺一即丢弃该条，封面同时认 `coverImg` 与 `artwork`（design 决策 5）
- [x] 2.5 同文件：`fetchTopLists(plugin)` 与 `fetchSheetTags(plugin)`，各经 `invokePlugin` 调用并校验分组形状；`pinned` 合并为一个无标题分组置顶；空分组整组丢弃
- [x] 2.6 同文件：`fetchSheetsByTag(plugin, tag, page)` 校验 `{ isEnd?, data }`，`isEnd` 缺省推断沿用 `parsePage` 的规则
- [x] 2.7 同文件：`fetchTrackPage(plugin, kind, item, page)` 按 `kind` 调 `getTopListDetail` 或 `getMusicSheetInfo`，共用 `parseTrackPage` 校验 `{ isEnd?, musicList }`；曲目条目经 `toCandidateTrack`，畸形条目丢弃、其余继续
- [x] 2.8 以上全部调用失败只抛 `PluginCallError`，不在发现模块里做任何 try/catch 之外的兜底；单插件失败由界面按插件分区呈现

## 3. 界面

- [x] 3.1 把 `src/plugins/screens/search.android.tsx` 里的 `CandidateRow` 抽到 `src/plugins/ui/candidate-row.tsx`，搜索页改为引用；行为与视觉不变
- [x] 3.2 新建发现首页 `src/plugins/screens/discovery.android.tsx` 与平台中立空实现 `discovery.tsx`（`Redirect` 回首页，写法同 `manage.tsx`），路由文件 `src/app/plugin-discovery/index.tsx` 转发
- [x] 3.3 发现首页：进入时对 `discoveryPlugins()` 里的每个插件并发发起它具备的请求，每个插件一个区块，区块内自带加载中、失败原因、内容三态（design 决策 6）；榜单按分组横向滚动，标签以胶囊展示；没有任何插件具备发现能力时按 spec 说明原因，不出现空白页
- [x] 3.4 新建标签下歌单列表页 `src/plugins/screens/discovery-sheets.android.tsx` 及空实现与路由 `src/app/plugin-discovery/sheets.tsx`：参数 `platform` 与 JSON 序列化的 `tag`（design 决策 4），分页加载、到底停止、失败展示原因
- [x] 3.5 新建候选曲目分页页 `src/plugins/screens/discovery-tracks.android.tsx` 及空实现与路由 `src/app/plugin-discovery/tracks.tsx`：参数 `platform`、`kind`、JSON 序列化的 `item`（design 决策 3、4）；分页、到底、失败展示与逐首加入复用搜索页的做法，已加入的行显示对勾
- [x] 3.6 `src/plugins/screens/manage.android.tsx` 头部在搜索图标旁增加发现入口（design 决策 2），iOS 侧因整棵子树在裁剪线内无需任何改动
- [x] 3.7 页面标题与列表底部余量：标题按 `platform` 与条目标题拼，底部余量用 `useMiniDockInset()`，与搜索页一致

## 4. 文档与检查

- [x] 4.1 `docs/architecture.md` 插件模块一节补充发现层：它与搜索同属「候选曲目的来路」，共用候选模型、调用通道与裁剪线
- [x] 4.2 `README.md` 路线图更新 C6 状态；`openspec/PRODUCT.md` 路线图把 C6b 拆成三片并标注本片状态
- [x] 4.3 跑 `pnpm lint`、`pnpm typecheck`、`pnpm check:constraints`；跑 `pnpm check:ios-strip` 确认新增文件全部在裁剪线内、iOS 产物模块清单不含 `src/plugins/discovery.ts` 与三个 `.android.tsx` 屏幕

## 5. 验收（Android）

> 按 PRODUCT.md 的验收策略，本次只在 Android 上验收；iOS 侧留待全量验收（design Risks 已标「iOS 待复验」）。

- [x] 5.1 未安装任何插件时进入发现入口 → 说明当前没有可浏览的插件，无空白页、无错误提示 — 通过（2026-09-11，卸载全部插件后进入）
- [x] 5.2 只安装一个未实现任何发现方法的插件（如歌词类插件）→ 同 5.1 的说明 — 通过（只剩歌词网时进入）
- [x] 5.3 安装实现了榜单的插件 → 首页出现该插件名下的榜单分组，标题与封面正确；插件未实现推荐歌单时不出现标签区块、无错误 — 通过（小蜗、网易各自分区；小蜗只出现榜单与标签，封面与分组标题正确）
- [x] 5.4 点开一个榜单 → 展示第一页曲目，每条标明来源插件；向下滚动追加下一页；插件表示到底后不再请求（看插件日志或加断点确认） — 通过（网易「飙升榜」：首页 50 首、`isEnd: true` 不再请求；两个样本的榜单详情都不分页，翻页追加改在 5.7 的歌单详情上验证）
- [x] 5.5 在榜单里加入一首曲目 → 曲库出现该曲目、归属该插件、可播放；再次加入同一首（或先通过插件搜索加入过）→ 不产生重复记录并提示已在曲库中 — 通过（网易「泪海」入库、归属网易、logcat 见 MediaSession PLAYING 且 position 推进；小蜗曲目入库正常但其 `getMediaSource` 上游返回 503，Node 里同样复现，是插件侧故障。再次加入同一首：曲目数不变，页面提示「已在曲库中」）
- [x] 5.6 浏览若干榜单与歌单但不加入 → 曲库、歌单、检索结果无任何变化 — 通过（曲目数只在两次显式加入时各 +1：12 → 13 → 14）
- [x] 5.7 安装实现了推荐歌单的插件 → 首页出现标签；选中标签 → 歌单分页列表；点开歌单 → 曲目分页列表并可加入 — 通过（小蜗「民谣」标签 → 歌单列表翻到第二页内容不同 → 歌单详情 30 首/页、翻页后到底不再出现加载指示）
- [x] 5.8 两个插件同时具备发现能力 → 各自分区展示；以断网方式让其中一个失败 → 该插件分区显示原因，另一个正常，应用其余功能不受影响 — 通过（断网：两插件四个请求各自显示 Network Error；注入让小蜗标签请求挂起：小蜗榜单与网易分区正常，页面可进出）
- [x] 5.9 让插件返回的曲目里混入缺主键或缺标题的条目（改样本插件或 mock）→ 这些条目被丢弃，其余正常，曲库中不出现它们 — 通过（注入 `{title 无 id}`、`{id 无 title}`、`null`、字符串四条到小蜗榜单详情首部，列表首行仍是真实曲目，四条均未出现）
- [x] 5.10 离开发现入口后再进入 → 重新向插件请求（看插件日志确认），不展示旧结果 — 通过（重新进入榜单详情出现加载指示并重新请求，已加入标记重置；发现首页每次挂载重新请求）
- [x] 5.11 首次进入时某插件请求超过 15 秒 → 该分区按超时显示，界面全程可操作 — 通过（小蜗标签分区在 15 秒后显示「超过 15 秒未返回」，等待期间进出榜单详情正常）

## Spike 记录

2026-09-11。样本取自模拟器上已安装的三个插件（从 `files/plugins/` 拉出），在 Node 里用与宿主相同的注入依赖执行：小蜗音乐 v0.0.3、网易音乐 v2025.09.14 都实现了全部五个方法；歌词网只有 `search` / `getLyric`，1.2 成立。两者都未声明 `primaryKey`（缺省 `['id']`）。

| 方法 | 网易音乐 | 小蜗音乐 | 与协议表的出入 |
| --- | --- | --- | --- |
| `getTopLists` | `[{ title, data }]`，7 组；榜单项 `id` 为**数字**，同时给 `artwork` 与 `coverImg`（同一地址），有 `description` | `[{ title, data }]`，5 组；榜单项只给 `coverImg`，有 `description` | 无。`id` 要同时接受字符串与数字 |
| `getTopListDetail` | `{ isEnd: true, musicList(50), sheetItem, topListItem }`；忽略 `page`，每页都返回整份 | `{ ...榜单项, musicList(80) }`；**不给 `isEnd`**，忽略 `page`，第 2 页与第 1 页完全相同 | **有**：`isEnd` 缺省不能沿用 `parsePage` 的「结果为空才算到底」——那会无休止地把同一页追加下去。改为缺省视为已到底，见 design 决策 5 |
| `getRecommendSheetTags` | `{ pinned(11), data(5 组) }`，标签只有 `{ id, title }` | `{ data(7 组), pinned(4) }`，分组内标签带 `digest` 字段，插件靠它选接口 | 无。`digest` 这类字段说明标签必须原样回传（决策 4） |
| `getRecommendSheetsByTag` | `{ isEnd, data }`，歌单项 `id` 为字符串，封面在 `artwork` | `{ isEnd, data }`，封面在 `artwork`；**置顶标签与 `digest: "43"` 的分组标签在插件侧报错**（上游接口已变），只有 `digest: "10000"` 的标签能取到歌单 | 无。插件侧故障，界面按「该请求失败 + 原因」呈现，正好覆盖验收 5.8 的失败态 |
| `getMusicSheetInfo` | `{ isEnd: true, musicList(163), sheetItem }`；忽略 `page`，一次返回整份 | `{ isEnd, musicList(30) }`；按页返回，第 2 页内容不同，末页 `isEnd: true` | 无 |

封面字段结论：榜单项以 `coverImg` 为主（网易两者都给），歌单项两个样本都用 `artwork`。两者都认的方案成立，design 的 Open Question 已关闭。曲目条目与搜索同构（`id` / `title` / `artist` / `album` / `artwork`），网易的 `duration` 仍是毫秒（C6a 已记录的插件侧问题，不处理）。路由参数体量：榜单项与歌单项序列化后都在 300 字节以内，决策 4 的已知边界未触发。
