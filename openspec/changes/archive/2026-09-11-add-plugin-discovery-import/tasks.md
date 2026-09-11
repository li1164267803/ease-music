## 1. 能力判定与协议接入

- [x] 1.1 `src/plugins/protocol.ts`：`PluginMeta` 增加 `canImportSheet`、`canImportItem` 与 `importHints: { sheet: string[]; item: string[] }`（design 决策 7）
- [x] 1.2 `src/plugins/host/loader.ts`：计算上述字段；`hints` 只收字符串元素，非数组或非字符串一律丢弃
- [x] 1.3 `src/plugins/manager.ts`：新增 `importingPlugins()`（任一导入能力）；`src/plugins/api.ts` 的 `PluginSummary` 补两个能力位，管理页 `describeCapabilities` 补「导入歌单」「导入单曲」
- [x] 1.4 `src/plugins/discovery.ts`：新增 `collectTracks(plugin, kind, item, onProgress?)`——逐页调用 `fetchTrackPage` 直到 `isEnd` 或 `MAX_PAGES = 100`，返回 `{ items, truncated }`；任一页失败原样抛出（决策 2）
- [x] 1.5 `src/plugins/discovery.ts`：新增 `importSheet(plugin, urlLike)` 与 `importItem(plugin, urlLike)`，经 `invokePlugin`，`parse` 区分不识别 / 识别 / 畸形（决策 6）；识别的条目走 `toCandidateTrack`

## 2. 曲库侧批量入库（核心层）

- [x] 2.1 `src/domain/repository/track-repository.ts`：新增 `addTracks(inputs)`，一个排他事务内逐条去重插入，返回保持顺序的 `{ track, created }[]`；`addTrack` 改为其单元素包装（决策 3）
- [x] 2.2 `src/library/import.ts`：新增 `importCandidates(candidates, target)`，`target` 为新建（名称）或既有歌单；空白名称返回失败且不入库；返回 `{ playlist, added, duplicates, addedToPlaylist }`

## 3. 界面

- [x] 3.1 新建 `src/plugins/ui/import-to-playlist-sheet.tsx`（决策 4）：入参为候选曲目获取函数与默认歌单名；内部三段状态——取曲目（进度文字「正在获取第 N 页…」，失败显示原因并可重试）、选目标（新建：名称输入，默认值为来源标题；既有：歌单列表）、结果（新增 N 首、M 首原已在曲库、触顶时注明只导入了前 N 首；提供「查看歌单」跳转 `/playlist/[id]`）
- [x] 3.2 候选曲目页 `discovery-tracks.android.tsx`：列表上方增加「全部加入歌单」入口（副文案说明会取完整个列表），打开弹层并传入 `collectTracks`；默认歌单名为条目标题或艺人名
- [x] 3.3 新建导入页 `discovery-import.android.tsx`、空实现 `discovery-import.tsx` 与路由 `src/app/plugin-discovery/import.tsx`（决策 5）：插件胶囊 → 模式胶囊（按所选插件能力）→ 输入框 → 该模式的 `importHints` → 「解析」；结果区为候选曲目列表（歌单模式，上方有「全部加入歌单」，默认歌单名为空由用户填写）或单条候选曲目（单曲模式）；三种回答各自的文案
- [x] 3.4 发现首页 `discovery.android.tsx`：任一插件具备导入能力时在顶部显示「导入外部歌单或单曲」入口；「没有可用于浏览的插件」的判断与文案把导入能力算进去

## 4. 文档与检查

- [x] 4.1 `docs/architecture.md` 插件一节：发现层表格补 `importMusicSheet` / `importMusicItem`，另加一段说明批量入库路径（`collectTracks → importCandidates`，后者在核心层）与映射决策
- [x] 4.2 `README.md` 路线图与 `openspec/PRODUCT.md` 路线图更新 C6b-3 状态；PRODUCT.md 的前置决策一栏改为指向 design 决策 1
- [x] 4.3 `tools/check-ios-strip.mjs` 与 ESLint 清单登记新增屏幕与 `import-to-playlist-sheet`；跑 `pnpm lint`、`pnpm typecheck`、`pnpm check:constraints`、`pnpm check:ios-strip`

## 5. 验收（Android）

> 按 PRODUCT.md 的验收策略，本次只在 Android 上验收；iOS 侧留待全量验收。样本：网易音乐（歌单与单曲导入均可用、榜单一页全出）、小蜗音乐（歌单导入识别但返回空、艺人单曲分页）、歌词网（无导入能力）。

- [x] 5.1 网易一张榜单的曲目页 →「全部加入歌单」→ 新建（默认名为榜单标题）→ 结果显示新增数；曲库与歌单列表出现该歌单，顺序与榜单一致，可播放
- [x] 5.2 同一榜单再次导入到同一歌单 → 曲库数量不变，歌单条目不重复、顺序不变，结果显示新增 0 首
- [x] 5.3 先逐首加入榜单里的两首，再整单导入到新歌单 → 结果显示「M 首原已在曲库」，两首仍进了歌单，曲库无重复
- [x] 5.4 小蜗艺人「单曲」页（分页）→ 全部加入 → 进度文字出现过第 2 页，歌单曲目数等于全部页之和
- [x] 5.5 追加到既有歌单：把一张专辑加到已有曲目的歌单 → 追加在末尾，原有条目不动
- [x] 5.6 新建歌单名改为空白 → 提示名称不能为空，曲库与歌单均无变化
- [x] 5.7 注入副本让 `getTopListDetail` 第 2 页挂起 → 超时后显示「取第 2 页时…超过 15 秒未返回」，曲库无变化；恢复原件后重试成功
- [x] 5.8 导入页：选网易、歌单模式、粘贴分享文案 → 候选列表；「全部加入歌单」→ 填名 → 成功。粘贴无关文字 → 「无法识别这个链接」；歌词网不出现在插件胶囊里
- [x] 5.9 导入页：选小蜗、粘贴纯数字歌单 ID → 「没有取到任何曲目」，无空白页；小蜗只有「歌单」模式、没有「单曲」
- [x] 5.10 导入页：选网易、单曲模式、粘贴单曲链接 → 一条候选曲目，加入后进曲库；再次加入提示已在曲库
- [x] 5.11 注入副本让 `importMusicSheet` 返回字符串 → 「返回了不符合协议的数据」；返回 `false` 的原件路径已由 5.8 覆盖
- [x] 5.12 只安装歌词网 → 发现首页无导入入口，且「没有可用于浏览的插件」文案正常；管理页三个插件的能力描述与其声明一致（网易含「导入歌单、导入单曲」，小蜗含「导入歌单」）
- [x] 5.13 卸载网易后 → 导入生成的歌单与曲目仍在，曲目按既有规则显示不可用

## 实施记录

- `addTrack` 没有做成 `addTracks([input])` 的包装（design 决策 3 的原话）：`noUncheckedIndexedAccess` 下取 `[0]` 要么加断言要么加一个永远不会走到的分支。改为两者共用一个 `insertUnlessExisting(executor, input)`，`addTracks` 在排他事务里逐条调用，`addTrack` 直接拿数据库对象调用一次——单首入库本来就不需要事务。
- 弹层内的名称输入框聚焦时软键盘会盖住整个弹层（`Sheet` 是底部 Modal，未随键盘上移），收起键盘后才能看到按钮。`NameSheet` 在音乐库里是同一形态，属既有行为，本片不改；单独记下。
- 批量入库结果里的「M 首本就在该歌单中」在一种情况下措辞不准：来源列表内部含重复条目（小蜗艺人单曲 1708 首里有 2 首重复）时，第二次出现的曲目被歌单关联的 `INSERT OR IGNORE` 跳过，也会被计进这一项。数字是对的，语义上它是「本次列表里重复的」。没有为它单开一个计数——多一个状态只为一句话的措辞。
- 5.4 的「进度文字出现过第 2 页」没有截到图：小蜗每页 200 ms，1708 首（数十页）在截图到达前就取完了。页数校验改由结果证明：弹层报「共 1708 首」，远超单页；数据库里歌单条目 50 → 1756。
- 5.7 的「恢复原件后重试成功」没有单独再跑：恢复原件后的同一路径就是 5.4 / 5.5，已通过；「重试」按钮本身在失败态可见。
- 验收数据：曲库 1807 首、歌单「网易云中文说唱榜」1756 条（前 50 条为榜单原顺序，第 51 条起为小蜗艺人单曲）、「wy-import」35 条；`(source_id, source_key)` 无重复。三份注入副本（小蜗第 2 页挂起、网易导入返回字符串、两者去掉发现与导入能力）验收后均已换回原件；网易在 5.13 卸载后经本机 HTTP 重装，文件 id 变了，插件名不变。

## Spike 记录

提案阶段已完成，见 design.md Context 的表。核对方式与前两片相同：从模拟器拉出已安装插件的源码，在 Node 里用同一套注入依赖执行 `importMusicSheet` / `importMusicItem`。
