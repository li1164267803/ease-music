## 1. 推进规则（纯函数，可单测）

- [x] 1.1 `src/playback/queue.ts` 的 `step` 把 `{ auto }` 改为推进原因 `'finished' | 'skipped' | 'user'`（design 决策 1）：`finished` 在单曲循环下返回当前曲目；`skipped` 在单曲循环下按列表循环移动、顺序模式到边界返回 `null`；`user` 行为与原 `auto: false` 相同。验证：`pnpm typecheck` 通过
- [x] 1.2 新建 `src/playback/queue.test.ts`（沿用 `src/library/m3u.test.ts` 的运行方式），在 `package.json` 增加 `test:queue` 脚本；覆盖四种播放模式 × 三种原因 × 两个方向，含队列首尾边界与随机模式顺序表。验证：`pnpm test:queue` 全部通过

## 2. 播放控制器

- [x] 2.1 `advance` 接收推进原因；「单曲循环同一首 → `seekTo(0) + play`」只在 `finished` 时成立；`onStatus` 的 `didJustFinish` 传 `finished`，`next` / `previous` 传 `user`。验证：typecheck 通过，全局检索确认不再有布尔 `auto` 的调用点
- [x] 2.2 `load()` 接收方向参数（design 决策 2）：`next` 与自然播完为 `1`，`previous` 为 `-1`，`playQueue` / `playTrackAt` 为 `1`；失败后以该方向执行 `skipped` 推进，跳过链继承同一方向；曲目成功开始发声后方向恢复为 `1`。验证：设备上「上一曲」切到失败曲目时继续向前（见 5.3）
- [x] 2.3 快照 `error` 改为 `failure: { trackId, message } | null`（`message` 为播放层拼好的完整文案），`clearError` 改为 `clearFailure`（design 决策 3）：`load()` 开头不再清除；清除仅限用户关闭、`failure.trackId` 成功开始发声、队列清空三处。验证：typecheck 通过，全局检索确认 `load()` 内无失败记录的清除
- [x] 2.4 连续失败上限改为常量 `MAX_CONSECUTIVE_FAILURES = 5`（design 决策 4），删除「以队列长度为上限」的旧规则与注释；达到上限或此刻 `playWhenReady` 为假时停止跳过、暂停，推进到队列边界时计数同样归零；失败文案为「连续 5 首无法播放，已停止。最近一首「标题」：原因」；成功开始发声时归零。验证：设备上见 5.4
- [x] 2.5 装载开始即脱钩（design 决策 5 第 1、2 条）：暂停引擎，发布 `positionMs: 0` 与 `durationMs: track.durationMs ?? 0`，同步系统媒体控件元数据；新增 `engineSource: { token, uri, headers }`，在 `replace` 成功时写入当次 `loadToken` 与音源地址、请求头，`onStatus` 在令牌不等时丢弃回报；引擎报错时置空（取代按错误文本去重），停止时 `loadToken` 自增作废进行中的装载，装载期间 `seekTo` 不生效。验证：设备上切到一首插件曲目的解析期间，上一首不再发声、进度条不再走动
- [x] 2.6 播放意图 `playWhenReady`（design 决策 5 第 3、5 条）：装载开始取 `autoPlay`；装载中 `togglePlayPause` 只改意图，`replace` 完成后按意图决定是否 `play()`；音源归属当前曲目且引擎 `ready` 时由 `status.playing` 同步（`idle` / `buffering` 时的 `playing` 是旧值，不参与同步）；`toState` 在 `isBuffering` 时按「曲目是否已首次就绪」区分 `loading` 与 `buffering`；当前曲目音源不在引擎中时，`togglePlayPause` 重新装载当前曲目。验证：设备上见 5.5、5.6
- [x] 2.7 引擎错误诊断（design 决策 6）：http(s) 音源携带播放用的请求头与 User-Agent 发 `Range: bytes=0-1` 的 GET（8 秒超时），按「连接失败 / 4xx·5xx / 2xx」生成原因；使用 `expo/fetch`，拿到响应头即中止；失败处理不等探测，结果到达前原因暂为「正在检查原因…」；非 http(s) 音源直接报「无法解码」；探测结果只更新仍属于该曲目的失败记录；文案与 `src/cache/download.ts` 的 `describeFailure` 保持一致。验证：设备上见 5.7
- [x] 2.8 队列清空时调用 `clearLockScreenControls()` 并重置 `lockScreenActive`（design 决策 7），覆盖 `clearQueue` 与 `removeFromQueue` 使队列变空两条路径。验证：设备上见 5.8

## 3. 界面

- [x] 3.1 `src/ui/mini-player.tsx`：按钮改读 `playWhenReady`；`loading` / `buffering` 且意图为播放时副标题显示「正在加载…」/「缓冲中…」；存在 `failure` 时副标题前显示 `TriangleAlert` 图标。验证：lint 与 typecheck 通过，设备上见 5.5、5.2
- [x] 3.2 `src/app/player.tsx`：按钮改读 `playWhenReady`；时间行中间显示加载/缓冲文案；失败卡片内容改为 `failure.message`，点击调用 `clearFailure`，并更新卡片旁关于清空时机的注释。验证：lint 与 typecheck 通过，设备上见 5.2

## 4. 静态检查

- [x] 4.1 `pnpm lint`、`pnpm typecheck`、`pnpm test:queue`、`pnpm test:m3u`、`pnpm check:constraints`、`pnpm check:ios-strip` 全部通过

## 5. Android 验收

测试素材沿用仓库外的验收服务（`/audio/fail.mp3` 返回 500、`/audio/gone.mp3` 可切换为 404、`/audio/stall.mp3` 限速）与自制测试插件；验收完成后清理测试数据。

- [x] 5.1 四种播放模式下各验一遍：用户切歌、自然播完（单曲循环重复当前曲目）、失败跳过（单曲循环也切到下一首），实际发声、界面曲目、系统媒体控件三者始终一致
- [x] 5.2 队列 [可播, 失败(500), 可播]，从第一首开始自然播放 → 跳过失败曲目后，迷你播放器出现警示图标，播放页显示「「标题」播放失败：原因」；关闭后消失；再次播放该曲目并成功后，提示不再出现
- [x] 5.3 在第三首点「上一曲」切到失败曲目 → 继续向前跳到第一首，而不是弹回第三首
- [x] 5.4 队列里连续 6 首以上失败 → 第 5 首失败后停止、保持暂停，文案为「连续 5 首无法播放」；手动点下一曲可继续且计数重新开始
- [x] 5.5 播放一首解析较慢的插件曲目与限速远程曲目 → 开始加载阶段按钮显示为可暂停并有「正在加载…」，中途缓冲时显示「缓冲中…」，两处（迷你播放器、播放页）都不显示为已暂停；观察切歌瞬间按钮与进度是否闪回上一首的状态（design Risks 所记残留），有可感知的闪烁时记录下来
- [x] 5.6 加载过程中点暂停 → 加载完成后不自动发声，显示为已暂停；再点播放正常开始；装载失败并停止后点播放 → 重新尝试装载当前曲目，不会播放上一首的音频
- [x] 5.7 远程地址分别为 404、500、无法连接（停掉验收服务）、可访问但内容不是音频 → 失败原因依次为「地址返回了错误（HTTP 404）」「（HTTP 500）」「无法连接到音频地址」「音频无法解码」，不再出现「Source error」；曲目仍在曲库中；探测期间与之后 LogBox 无未处理的 Promise 异常
- [x] 5.8 从队列移除全部曲目 → 通知栏与锁屏的媒体卡片撤下；随后再播放任意曲目，媒体卡片正常出现并可控制
- [x] 5.9 回归：后台播放、锁屏暂停、耳机按键、拖动进度条、从队列移除正在播放的曲目、播放历史记录，行为与改动前一致
- [x] 5.10 失败曲目停在播放页时，总时长为该曲目自身时长（未知时显示 `--:--`），不沿用上一首
