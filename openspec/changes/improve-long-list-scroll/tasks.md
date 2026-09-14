## 1. 前置

- [ ] 1.1 确认 `fix-playback-failure-handling` 已实施（design 的 Context「顺序」一节）。验证：该 change 的 tasks 全部勾选
- [ ] 1.2 检查宿主内存（`sysctl vm.swapusage`、`memory_pressure`），在关闭模拟器的情况下构建 Android release 包。验证：`android/app/build/outputs/apk/release/` 下产出 APK；构建中出现内存不足时停下报告，不重试
- [ ] 1.3 在 dev client 上备份 `files/SQLite`，注入 3000 首 `acc-bulk-` 测试曲目，确认曲库计数。验证：曲库计数为原数量 + 3000

## 2. release 包基线测量

- [ ] 2.1 `adb install -r` 覆盖安装 release 包，确认应用数据保留、曲库计数不变。验证：「全部曲目」显示的数量与注入后一致
- [ ] 2.2 按 design 决策 2 测「全部曲目」：暂停状态下 20 次快速下滑与 20 次快速上滑的帧统计；单次快速甩动 3 次的空白持续时间。验证：数值写入本 change 目录下的 `measurements.md`
- [ ] 2.3 同样方法测 1756 首歌单。验证：数值写入 `measurements.md`
- [ ] 2.4 播放一首曲目，在播放中重复 2.2 与 2.3。验证：数值写入 `measurements.md`
- [ ] 2.5 对照 design 决策 1 的门槛逐条判定，在 `measurements.md` 写出结论（达标 / 不达标及不达标的列表与条件），并记录测量中是否出现封面错位或滑动被识别为点击。验证：结论段落存在且每条门槛都有对应数值

## 3. 按测量结果处理

- [ ] 3.1 **若全部达标**：按 design 决策 4 更新 `bootstrap-music-player` tasks.md 问题清单第 6 条，跳过第 4 组；若 2.5 记录到封面错位，仍实施 4.3。验证：问题清单已更新
- [ ] 3.2 **若不达标**：按 design 决策 3 的顺序进入第 4 组，每实施一项后重复第 2 组中不达标的那几项测量并追加到 `measurements.md`，达标即停止，未实施的候选项在 `measurements.md` 中注明「未实施：已达标」。验证：`measurements.md` 中每项已实施的优化都有前后对比数值

## 4. 优化候选（仅在 3.2 时按顺序实施，达标即停）

- [ ] 4.1 新增按曲目订阅的选择器，「全部曲目」与歌单页的 `active` 改由行组件自取，页面不再订阅整个播放快照。验证：typecheck 通过；重测数值写入 `measurements.md`
- [ ] 4.2 两处列表的分隔组件提升到模块级，`renderItem` 稳定化。验证：React Profiler 中滚动期间无数据变化的行不再重渲染；重测数值写入 `measurements.md`
- [ ] 4.3 `src/ui/artwork.tsx` 为 expo-image 设置 `recyclingKey`。验证：快速滚动时封面不错位、不先闪旧图；重测数值写入 `measurements.md`
- [ ] 4.4 依据 Profiler 的单行耗时精简行组件。验证：单行渲染耗时下降；重测数值写入 `measurements.md`
- [ ] 4.5 歌单页：先尝试固定行高的 `getItemLayout` 与窗口化参数；仍不达标时评估「常态 FlashList、排序模式切换为可拖动列表」，评估结论写入 `measurements.md` 后再决定是否实施。验证：重测数值写入 `measurements.md`；拖动排序与排序持久化行为不变
- [ ] 4.6 试验 FlashList `drawDistance`。验证：前后对比写入 `measurements.md`，只在改善空白且不加重卡顿时保留

## 5. 收尾

- [ ] 5.1 `pnpm lint`、`pnpm typecheck`、`pnpm check:constraints`、`pnpm check:ios-strip` 全部通过（仅在第 4 组有代码修改时）
- [ ] 5.2 覆盖安装回 dev client，删除 `acc-bulk-` 测试曲目，确认曲库计数回到测量前。验证：曲库计数与 1.3 备份前一致
- [ ] 5.3 回归（仅在第 4 组有代码修改时）：正在播放的曲目在两处列表中高亮正确、切歌后高亮跟随；歌单拖动排序与重启后顺序保持；点击曲目播放、「更多」菜单、下载按钮行为不变
