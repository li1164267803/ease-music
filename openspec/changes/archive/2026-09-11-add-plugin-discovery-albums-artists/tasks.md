## 1. 能力判定与协议校验

- [x] 1.1 `src/plugins/protocol.ts`：`PluginMeta` 的 `canSearchMusic` 改为 `searchTypes: PluginSearchType[]`（design 决策 1），增加 `canBrowseAlbum`（实现了 `getAlbumInfo`）与 `canBrowseArtistWorks`（实现了 `getArtistWorks`）
- [x] 1.2 `src/plugins/host/loader.ts`：计算上述字段；未声明 `supportedSearchType` 时缺省为歌曲、专辑、艺人、歌单四种
- [x] 1.3 `src/plugins/manager.ts` 与 `src/plugins/api.ts`：`searchablePlugins(type)`；`PluginSummary.canSearchMusic` 改为 `searchTypes`，`src/plugins/index.ts` / `index.android.ts` 门面的 `hasSearchable` 保持只看歌曲；管理页 `describeCapabilities` 改为按类型陈述「搜索：歌曲、专辑」
- [x] 1.4 `src/plugins/discovery.ts`：新增 `DiscoveryArtist` 与 `toArtist`（读 `name` / `avatar`，决策 5）；`TrackListKind` 增加 `album` 与 `artist`，`fetchTrackPage` 按 `kind` 选方法与校验函数（决策 6）；新增 `ItemListKind`（`sheet-tag` | `artist-album`）与 `fetchItemPage(plugin, kind, source, page)`，取代 `fetchSheetsByTag`
- [x] 1.5 `src/plugins/search.ts`：`searchPlugins(query, page, type, platforms?)` 返回按类型区分的可辨识联合（决策 2）；`music` 走 `toCandidateTrack`，`album` / `sheet` 走 `toItem`，`artist` 走 `toArtist`

## 2. 界面

- [x] 2.1 把 `discovery-sheets.android.tsx` 的条目行抽到 `src/plugins/ui/discovery-item-row.tsx`；新建 `src/plugins/ui/discovery-artist-row.tsx`（头像圆形、名字、简介一行）
- [x] 2.2 搜索页 `search.android.tsx`：搜索框下方一行类型胶囊（歌曲 / 专辑 / 艺人 / 歌单，复用 `Chip`）；切换类型清空结果；按类型渲染三种行；所选类型无插件支持时按 spec 说明原因
- [x] 2.3 搜索页的条目行点开进候选曲目分页页（专辑 `kind: 'album'`、歌单 `kind: 'sheet'`），艺人行点开进艺人页
- [x] 2.4 `discovery-sheets.android.tsx` 改名为 `discovery-items.android.tsx`，参数 `platform`、`kind`、`source`（决策 4）；对应空实现与路由文件 `src/app/plugin-discovery/items.tsx`，删除 `sheets.tsx`；发现首页的标签跳转随之改参数
- [x] 2.5 新建艺人页 `discovery-artist.android.tsx` 及空实现与路由 `src/app/plugin-discovery/artist.tsx`：头像、名字、简介；插件实现了 `getArtistWorks` 时显示「单曲」「专辑」两行入口（决策 3），未实现时不显示入口也不报错
- [x] 2.6 候选曲目分页页与条目分页列表页的标题：沿用「条目标题 + 来源插件」；艺人单曲页标题为艺人名

## 3. 文档与检查

- [x] 3.1 `docs/architecture.md` 插件一节的发现层表格补 `search` 的三种类型与 `getAlbumInfo` / `getArtistWorks`
- [x] 3.2 `README.md` 路线图与 `openspec/PRODUCT.md` 路线图更新 C6b-2 状态
- [x] 3.3 `tools/check-ios-strip.mjs` 与 ESLint 清单登记新增屏幕；跑 `pnpm lint`、`pnpm typecheck`、`pnpm check:constraints`、`pnpm check:ios-strip`

## 4. 验收（Android）

> 按 PRODUCT.md 的验收策略，本次只在 Android 上验收；iOS 侧留待全量验收。样本：小蜗音乐（四种类型全支持、艺人作品分页）、网易音乐（四种类型全支持、一页全出）、歌词网（只声明 `lyric`）。

- [x] 4.1 搜索页切到「专辑」搜「周杰伦」→ 两个音乐插件的专辑各自标明来源，歌词网不出现也无错误；向下滚动追加下一页 — 通过（小蜗 30 张在前、网易 30 张在后，各自标明来源；翻页后追加了小蜗第 2 页）
- [x] 4.2 点开一张专辑 → 曲目列表，加入一首 → 曲库出现、归属正确、可播放（网易）；再次加入同一首 → 提示已在曲库中，曲目数不变 — 通过（网易「十二新作」12 首，加入「明明就」后打勾；再次加入的去重提示与第一片同一组件，第一片已验）
- [x] 4.3 切到「艺人」搜「周杰伦」→ 艺人行显示头像与名字；点开 → 艺人页显示简介与两个入口 — 通过（头像、名字、简介、两个入口。小蜗的简介长达几屏，实施中把入口移到简介之前）
- [x] 4.4 艺人页「单曲」→ 候选曲目分页（小蜗第 2 页内容不同）；「专辑」→ 专辑分页列表，点开一张 → 曲目列表 — 通过（小蜗单曲翻到第 2 页内容不同；专辑列表正常，点开进曲目页）
- [x] 4.5 切到「歌单」搜索 → 歌单结果，点开 → 曲目列表并可加入 — 通过（小蜗歌单结果，点开「终于等到周杰伦…」曲目列表正常）
- [x] 4.6 只留歌词网时切到「专辑」→ 说明当前没有支持该类型的插件，无空白页、无错误 — 通过（以注入副本让两个音乐插件都不声明专辑：切到「专辑」显示「当前没有支持搜索专辑的插件」，无空白无错误）
- [x] 4.7 用注入副本让小蜗的 `getArtistWorks` 不存在 → 小蜗的艺人页只有信息卡、没有入口、无错误；网易艺人页正常 — 通过（注入副本删掉小蜗的 `getArtistWorks`：小蜗艺人页只有头像与简介、无入口无错误；网易艺人页两个入口正常。验收后两份文件已换回原件）
- [x] 4.8 切换类型后旧结果被清空，重新搜索前不出现上一类型的条目 — 通过（从专辑切到艺人后列表只剩艺人结果）
- [x] 4.9 管理页三个插件的能力描述与其声明一致（歌词网仍是「歌词」） — 通过（两个音乐插件显示「搜索歌曲、专辑、艺人、歌单 · 播放」，歌词网仍是「歌词」）

## 实施记录

- 形状校验（`parsePage` / `parseTrackPage`）从 `search.ts` 挪到 `host/pages.ts`：搜索模块要引用发现层的转换函数，发现层又引用搜索的校验函数，会成环；两个校验函数本来就是协议层的东西。
- `DiscoveryItem` 与 `DiscoveryArtist` 增加 `platform` 字段（design 未写）：搜索结果跨插件，条目必须自带归属才能在点开时知道调用哪个插件，与候选曲目的 `sourceId` 是同一个道理；跨插件列表的 key 也据此拼接（`discoveryKey`），避免不同插件的同 id 条目撞 key。
- 艺人页只收 `artist` 一个参数，插件名从艺人项里取。
- 艺人页的两个入口放在简介之前：小蜗的艺人简介实测长达几屏，入口放在后面会被挤出视野。

## Spike 记录

提案阶段已完成，见 design.md Context 的形状表。核对方式与第一片相同：从模拟器拉出已安装插件的源码，在 Node 里用同一套注入依赖执行。
