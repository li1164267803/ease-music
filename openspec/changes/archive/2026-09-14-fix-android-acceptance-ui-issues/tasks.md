## 1. 插件页面

- [x] 1.1 新增 `src/plugins/ui/use-candidate-add.ts`，导出 `useCandidateAdd()` 返回 `{ added, notice, add }`（design 决策 1）。验证：`pnpm typecheck` 通过
- [x] 1.2 `discovery-tracks.android.tsx` 与 `discovery-import.android.tsx` 改用 `useCandidateAdd`，删除各自的加入逻辑。验证：lint 与 typecheck 通过，全局检索 `addCandidateTrack(` 只剩 hook 内一处调用
- [x] 1.3 `search.android.tsx` 改用 `useCandidateAdd`，在列表上方展示提示；第一页搜索开始时清空 `failures`。验证：设备上见 5.1、5.2
- [x] 1.4 `manage.android.tsx` 的 `PluginCard`：未声明 `srcUrl` 时渲染不可用的「更新」入口，并在卡片内说明「该插件未声明更新地址，无法自动更新」。验证：设备上见 5.3
- [x] 1.5 `manage.android.tsx` 的风险告知标记初值改为 `null`，`guarded` 在未知时等待读取结果再判断（design 决策 6）。验证：typecheck 通过；设备上删掉标记后冷启动立刻点「从地址安装」仍弹出风险告知

## 2. 公共组件与数据

- [x] 2.1 `src/ui/sheet.tsx` 内容区包入 `KeyboardAvoidingView`（design 决策 2）。验证：设备上见 5.4
- [x] 2.2 `src/cache/queue.ts`：本轮结果改为记录完成与失败的曲目标识，快照暴露等待中/下载中/完成/失败的曲目 id（design 决策 3）。验证：typecheck 通过
- [x] 2.3 `src/app/playlist/[id].tsx` 的 `describeQueue` 按本歌单曲目 id 集合过滤后再统计与展示；交集为空不显示。验证：设备上见 5.5
- [x] 2.4 `src/ui/indexed-track-row.tsx` 增加 `positionWidth`，序号文本单行、等宽数字；歌单页按总曲目数位数计算后传入（design 决策 4）。验证：设备上见 5.6
- [x] 2.5 `src/library/store.ts` 的 `useCollections`：未知专辑 / 未知艺术家分组的 `coverUri` 为 `null`、`meta` 为「N 首」（design 决策 7）。验证：设备上见 5.7

## 3. 文案

- [x] 3.1 修正 5 处跨行 JSX 文本（design 决策 5）：`src/plugins/ui/risk-notice.tsx` 两段、`manage.android.tsx` 空状态与版本确认、`search.android.tsx` 无可用插件提示。验证：设备上逐处查看无多余空格
- [x] 3.2 复查其余页面有无同类写法：扫描 `src/**/*.tsx` 中相邻两行都含中文、且不以 `<`、`{`、`//`、`*` 开头的 JSX 文本行，排除注释与属性值后应无剩余。验证：扫描结果为空

## 4. 静态检查

- [x] 4.1 `pnpm lint`、`pnpm typecheck`、`pnpm test:m3u`、`pnpm check:constraints`、`pnpm check:ios-strip` 全部通过

## 5. Android 验收

- [x] 5.1 插件搜索中把一首已在曲库的曲目再次加入 → 列表上方出现「「标题」已在曲库中。」，曲库无重复记录；榜单与链接导入两处行为不变
- [x] 5.2 插件搜索先得到一条插件失败信息，再发起另一次搜索 → 加载期间不再显示上一次的失败条目
- [x] 5.3 未声明更新地址的插件卡片 → 「更新」入口可见但不可用，并说明原因；声明了更新地址的插件行为不变
- [x] 5.4 逐个打开带输入框的面板并聚焦输入框：新建歌单、重命名歌单、导入音乐的远程地址与播放列表地址、从地址安装插件、插件变量设置、链接导入、「加入歌单」新建歌单名 → 输入框与确认按钮都在键盘上方可见、可点
- [x] 5.5 在歌单 A 发起批量下载后打开歌单 B（与 A 无共同曲目）→ B 不显示下载结果；两个歌单共有的曲目在 B 中下载时，B 只统计共有的那部分
- [x] 5.6 打开 1756 首的歌单，滚动到第 100 首与第 1000 首附近 → 序号单行显示，各行标题列对齐；少于 100 首的歌单外观与改动前一致
- [x] 5.7 发现页「为你推荐」与音乐库专辑、艺人视图中的「未知专辑」「未知艺术家」卡片 → 显示占位封面与「N 首」，不再出现某一首曲目的封面或艺术家
