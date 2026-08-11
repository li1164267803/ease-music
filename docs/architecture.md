# 分层约定

本文件是 `bootstrap-music-player` 变更中 design.md 所确立分层的落地约定。**任何新增代码都必须能被归入下列某一层，且不得反向依赖。**

## 依赖方向

```
UI 层        src/ui, src/app
  ↓
能力层       src/playback（播放）   src/library（曲库导入 / 元数据 / 封面）
  ↓
来源层       src/sources
  ↓
领域层       src/domain
```

`src/plugins`（仅 Android）不属于这四层，它是跨层的独立模块，见文末。

上层可以依赖下层，**下层不得依赖上层**。同层之间的横向依赖需要有明确理由。

## 各层职责

### 领域层 `src/domain`

曲目、歌单、播放模式等领域模型与其持久化。这一层**不知道曲目来自哪里**，也不知道音频如何被播放。

- `model/` — 领域类型定义
- `db/` — SQLite 连接与迁移
- `repository/` — 曲库、歌单的仓储
- `settings.ts` — 轻量 KV 配置

### 来源层 `src/sources`

把「用户拥有的东西」转换成「可播放的地址」。每个来源实现同一套解析契约（可播放地址 + HTTP 请求头 + User-Agent），并在注册表中注册自己的来源标识。

- `contract.ts` — 解析契约类型与 `MediaSource` 接口
- `registry.ts` — 来源注册表
- `resolve.ts` — **唯一解析入口**，C2 离线缓存将在此处拦截
- `local-file/`、`remote-url/` — 具体来源实现

**约束**：**播放层不得感知具体来源**，只能通过 `resolve.ts` 取地址、`contract.ts` 取类型。此约束由 `eslint.config.js` 中一条仅作用于 `src/playback/**` 的 `no-restricted-imports` 规则机器化执行。

约束只落在播放层，不落在导入流程与 UI：导入本来就是来源特有的动作（本地文件要开系统文件选择器、远程地址要校验 URL），把它们一并禁掉只会逼出绕过规则的写法。media-source spec 要求来源无关的是**播放**——它只能拿到「地址 + 请求头 + UA」这一个形状。

### 播放层 `src/playback`

播放引擎的封装：播放控制、播放队列、播放模式、系统媒体会话、播放状态对外暴露。这一层通过来源层的解析入口拿地址，**不感知曲目来源类型**。

### 曲库能力 `src/library`

与播放层同级的另一个能力模块：元数据解析、封面提取与缓存、曲目导入流程的编排。它同时依赖领域层与来源层，但不被播放层依赖。

### UI 层 `src/ui` / `src/app`

`src/app` 是 expo-router 的路由文件，保持极薄，只做布局与组合。真正的界面组件、主题与交互放在 `src/ui`。

## 为什么这样分

- **来源可扩展**：新增网盘（C5）来源时，只在 `src/sources` 下加一个目录并注册，其余各层不动。
- **缓存可插入**：C2 离线缓存在 `src/sources/resolve.ts` 这个唯一入口处拦截，播放层无感。
- **插件可裁剪**：见下。

## 插件模块 `src/plugins`（仅 Android）

插件不在上面四层里，它是**跨层的独立模块**：自带宿主运行时、自己的持久化、自己的界面，并把自己注册进来源层。

注册方向是**插件推向注册表**（`registerSource` / `unregisterSource`），而不是注册表去拉插件——因此 `src/sources` 完全不知道插件的存在。这与 C5 网盘不同：网盘是内置来源，编译期就在数组里；插件的数量与标识运行时才确定，**一个插件即一个来源**。

与其余代码之间只有一条通路：

```
其余各层  ──►  src/plugins/index.ts        （门面，全空实现）
              src/plugins/screens/*.tsx    （屏幕，全空实现）
                        ▲
                        │ 同名 .android 文件在 Android 上顶替
                        │
              src/plugins/index.android.ts ──► host / manager / source / ui …
```

这条分界线就是 iOS 裁剪的全部机制：打包器按静态 `import` 关系收集模块，与代码是否可达无关，所以只有让 iOS 侧**根本不存在**那条 import，插件宿主与 `cheerio` 等专属依赖才不会进入产物；运行时判断 `Platform.OS` 做不到这一点。

三道守卫，缺一不可：

1. ESLint 禁止 `src/plugins` 之外的代码引用插件实现模块与插件专属依赖
2. `pnpm check:constraints` 在引用层面复查核心路径
3. `pnpm check:ios-strip` 导出真实 iOS 产物，断言模块清单里确实没有它们——**前两条都只看源码，只有这一条能证明裁剪真的生效**
