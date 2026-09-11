## Context

动机见 `proposal.md - Why`。本文只写实施所依赖的现状与约束。

第一片（`add-plugin-discovery-charts`）留下的地基，本片直接复用：

- **候选曲目分页页** `/plugin-discovery/tracks`：参数 `platform`、`kind`、JSON 序列化的条目；按 `kind` 选协议方法，其余分页、到底、失败、逐首加入全部共用。第一片的决策 3 已预留「再加两个 `kind` 值」。
- **单插件分页列表** `usePagedList`：进入即取第一页，到底或失败后不再请求。
- **条目与凭据**：`DiscoveryItem`（`id`、`title`、`artworkUri`、`description`、`raw`），凭据原样回传（决策 4、5）。
- **裁剪线**：全部界面在 `src/plugins/screens` 之下，只被 Android 侧引用，门面无需成员。

协议侧本片新接入的部分（对齐 MusicFree 公开规范，只参考协议不复制代码）。提案阶段已在 Node 里用两个样本插件（小蜗音乐 v0.0.3、网易音乐 v2025.09.14）跑通，形状如下：

| 方法                                    | 返回形状                                  | 样本实测                                                                                                        |
| --------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `search(q, page, 'album')`              | `{ isEnd?, data: [专辑项] }`              | 专辑项 `id`、`title`、`artist`、`artwork`、`description`、`date`，与第一片的歌单项同构；两样本都分页            |
| `search(q, page, 'artist')`             | `{ isEnd?, data: [艺人项] }`              | 艺人项 `id`、**`name`**、**`avatar`**、`description`、`worksNum`——字段名与曲目、专辑不同                        |
| `search(q, page, 'sheet')`              | `{ isEnd?, data: [歌单项] }`              | 与 `getRecommendSheetsByTag` 的歌单项同构，详情走第一片已有的 `getMusicSheetInfo`                               |
| `getAlbumInfo(album, page)`             | `{ isEnd?, albumItem?, musicList }`       | 与榜单详情同构；小蜗不给 `isEnd` 且不分页（一页全出），网易 `isEnd: true`——第一片「缺省视为到底」的规则正好覆盖 |
| `getArtistWorks(artist, page, 'music')` | `{ isEnd?, artistItem?, data: [曲目] }`   | **曲目在 `data` 而不是 `musicList`**，与搜索页同形；小蜗分页且第 2 页内容不同，网易一页全出并给 `isEnd: true`   |
| `getArtistWorks(artist, page, 'album')` | `{ isEnd?, artistItem?, data: [专辑项] }` | 同上，条目为专辑项；小蜗分页到第 2 页 `isEnd: true`                                                             |

两个样本的 `supportedSearchType` 都显式声明了四种类型（网易另有 `lyric`）；歌词网只声明 `lyric`。

## Goals / Non-Goals

**Goals:**

- 搜索页一处改动覆盖四种类型，非歌曲类型的结果走发现层的条目模型，不为搜索结果另建一套对象。
- 专辑曲目、艺人单曲进第一片的候选曲目分页页，只加 `kind`；艺人专辑进条目分页列表，同样只加 `kind`。
- 不新增故障处理路径，不改门面，不扩大裁剪守卫。

**Non-Goals:**

- 不做艺人页内的 Tab 切换与就地分页——两个入口各自导航到已有的列表页，艺人页本身只是一张信息卡。
- 不为 `getArtistWorks` 的 `sheet` 类型留界面：没有样本实现，没有验收依据。
- 不改 `invokePlugin` 的超时取值。

## Decisions

### 决策 1：搜索能力按类型判定，记入 `PluginMeta.searchTypes`

`PluginMeta` 把 `canSearchMusic` 替换为 `searchTypes: PluginSearchType[]`——实现了 `search` 且声明支持的类型集合；未声明 `supportedSearchType` 时按协议缺省视为支持歌曲、专辑、艺人、歌单四种（不含 `lyric`：歌词检索要求显式声明，这是 C3b 的既有决策）。管理器的 `searchablePlugins()` 改为 `searchablePlugins(type)`。`PluginSummary.canSearchMusic` 与管理页的能力描述随之改为按类型陈述。

这与第一片决策 1 是同一件事：能力在加载期一次判明，界面据此决定渲染什么，不靠调用后的失败倒推。

**备选：保留 `canSearchMusic`，另加三个布尔。** 未采纳：四个布尔各自的推导规则一模一样，一个集合就是它们的自然表达；后续协议若加类型也不用再加字段。

### 决策 2：`searchPlugins` 接受类型参数，返回按类型区分的结果

`search.ts` 的 `searchPlugins(query, page, type, platforms?)`：`music` 返回候选曲目；`album` / `sheet` 返回 `DiscoveryItem`；`artist` 返回 `DiscoveryArtist`。跨插件并发、`continuing` 游标、失败归因全部沿用，只是条目转换函数按类型选择。类型用可辨识联合表达，界面按 `type` 渲染候选曲目行、条目行或艺人行。

**门面契约不改**：`PluginsFacade.search` 仍只做歌曲搜索，Android 侧改为固定传 `music` 的包装；`hasSearchable` 同样只看歌曲。搜索页本来就直接调用实现模块而不经门面（它在裁剪线之内），类型搜索没有门面之外的调用方。

**备选：把类型搜索做成三个独立函数。** 未采纳：并发、游标、失败归因三段逻辑会复制三份，而它们与类型无关。

### 决策 3：艺人页是信息卡加两个入口，列表交给既有页面

新增 `/plugin-discovery/artist`，参数 `platform` 与 JSON 序列化的艺人项。页面展示头像、名字、简介；插件实现了 `getArtistWorks` 时显示「单曲」「专辑」两行入口：单曲导航到候选曲目分页页（`kind: 'artist'`），专辑导航到条目分页列表（`kind: 'artist-album'`）。

**备选：艺人页内放两个 Tab 就地分页。** 未采纳：两个 Tab 的内容分别就是候选曲目分页页与条目分页列表——在艺人页里再实现一遍，逐首加入的 `added` 集合、去重提示、分页三态都要复制。多一次导航换来零重复。

### 决策 4：标签下歌单列表页泛化为条目分页列表页

第一片的 `/plugin-discovery/sheets`（参数 `tag`）改为 `/plugin-discovery/items`，参数 `platform`、`kind`（`sheet-tag` | `artist-album`）、JSON 序列化的 `source`（标签或艺人项）。屏内按 `kind` 选择 `getRecommendSheetsByTag` 或 `getArtistWorks(…, 'album')`，点开条目时按 `kind` 决定曲目页的 `kind`（`sheet` 或 `album`）。

与候选曲目分页页的泛化是同一个做法（第一片决策 3），也是它被验证过可行的直接结果。

### 决策 5：艺人是与条目不同的展示类型

新增 `DiscoveryArtist = { id, name, avatarUri, description, raw }`。协议里艺人项用 `name` 与 `avatar`，不用 `title` 与 `artwork`；硬套进 `DiscoveryItem` 意味着在校验函数里写「艺人的 title 读 name」这种分支。`id` 与 `name` 缺一即丢弃。

### 决策 6：`fetchTrackPage` 的形状校验按 `kind` 选

`toplist` / `sheet` / `album` 用 `parseTrackPage`（`musicList`，`isEnd` 缺省视为到底）；`artist` 用搜索的 `parsePage`（`data`，`isEnd` 缺省为空才到底）。两个规则各自对应一种协议形状，不是对个别插件的兼容；spike 表明两样本的 `getArtistWorks` 都给了 `isEnd`，缺省规则不会被触发。

## Risks / Trade-offs

- **`searchTypes` 替换 `canSearchMusic` 会波及管理页与摘要类型** → 改动集中在 `loader.ts`、`manager.ts`、`api.ts` 的 `PluginSummary` 与管理页的能力描述四处，typecheck 会把漏改处全部指出。
- **搜索页同时承载三种行** → 行组件各自独立（候选曲目行已抽出，条目行本片从歌单列表页抽出，艺人行新建），搜索页只做按类型选择。
- **路由改名 `/plugin-discovery/sheets` → `/plugin-discovery/items`** → 该路由只有发现首页一个调用点，且尚未发布，无兼容负担。
- **iOS 待复验**：本片全部代码在裁剪线之内，`check:ios-strip` 在产物层面验证；完整走查留待 iOS 全量验收。

## Migration Plan

无数据迁移。`PluginMeta` 的字段变化在加载时计算，不持久化。

## Open Questions

无。提案阶段已用两个样本核对全部六种形状（见 Context 的表）。
