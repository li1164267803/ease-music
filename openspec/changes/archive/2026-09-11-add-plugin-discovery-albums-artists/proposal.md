## Why

C6b 第一片（`add-plugin-discovery-charts`，已归档）建立了发现层的地基：候选曲目分页页、单插件分页列表、插件凭据经路由参数原样回传。但插件搜索仍只有「歌曲」一种类型，用户找一张专辑、一位艺人的全部作品，只能一首一首搜。协议里 `search` 的 `album` / `artist` / `sheet` 三种类型与 `getAlbumInfo` / `getArtistWorks` 两个详情方法，两个样本插件都已实现，且返回形状与第一片处理过的对象同构——这是 C6b 第二片，成本最低的一片。

## What Changes

- **插件搜索增加类型切换（Android 独占）**：歌曲、专辑、艺人、歌单四种。只向声明支持该类型的插件发起请求；没有任何插件支持所选类型时说明原因。
- **专辑与歌单搜索结果**以条目列表呈现，点开后进入第一片的候选曲目分页页：专辑调 `getAlbumInfo`，歌单调 `getMusicSheetInfo`。
- **艺人搜索结果**点开后进入艺人页：展示头像、名字、简介，提供「单曲」与「专辑」两个入口。单曲经 `getArtistWorks(artist, page, 'music')` 进候选曲目分页页；专辑经 `getArtistWorks(artist, page, 'album')` 进条目分页列表，再点开进专辑曲目。
- **曲目仍是候选曲目**：逐首加入曲库，入库后同权、按插件主键去重，不引入第二套曲目表示。
- **插件未实现的类型或详情方法不视为错误**：加载期判定，未支持的在界面上不出现。
- **iOS 侧沿用编译期裁剪**：全部代码在第一片划定的子树之内，门面不改。

### 非目标

- **外部歌单导入与批量入库**：C6b 第三片，前置决策未变（外部歌单与本项目歌单体系如何映射）。
- **候选曲目直接试听**：独立 change。
- **艺人页展示歌单类作品**（`getArtistWorks` 的 `sheet` 类型）：协议允许但两个样本都未实现，没有样本就没有验收，留待有样本再评估。
- **搜索结果跨类型混排**：每次搜索只查一种类型，与协议的调用方式一致。
- **任何内置的推荐或榜单内容**：与前两片一致，所有内容来自用户自行安装的插件。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `plugin-discovery`：新增按专辑、艺人、歌单搜索，以及专辑曲目与艺人作品的浏览；曲目候选、故障隔离、实时获取、iOS 上不存在等既有要求不改措辞，自然覆盖新增路径。

## Impact

- **`src/plugins/protocol.ts` 与 `host/loader.ts`**：`PluginMeta` 增加按类型的搜索能力判定与两个详情方法的判定。
- **`src/plugins/search.ts`**：搜索接受类型参数；非歌曲类型的结果是发现层的条目而不是候选曲目。
- **`src/plugins/discovery.ts`**：新增艺人展示类型，曲目页与条目列表各多两个 `kind`。
- **`src/plugins/screens`**：搜索页加类型胶囊并按类型渲染三种行；标签下歌单列表页泛化为条目分页列表页（路由由 `/plugin-discovery/sheets` 改为 `/plugin-discovery/items`）；新增艺人页 `/plugin-discovery/artist`。
- **`src/plugins/api.ts` 与两份门面**：契约不改。门面的 `search` 仍是歌曲搜索（Android 侧改为固定传 `music` 的包装，目前没有门面之外的调用方）；`PluginSummary` 的 `canSearchMusic` 改为 `searchTypes`。本片的类型搜索由搜索页直接调用实现模块。
- **依赖**：无新增。`check:ios-strip` 清单登记新增屏幕，跑一次确认。
- **文档**：`README.md` 与 `openspec/PRODUCT.md` 路线图更新 C6b-2 状态；`docs/architecture.md` 插件一节的发现层表格补两个方法。
