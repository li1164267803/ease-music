<div align="center">

# 自在音乐 · EaseMusic

**你的歌，你说了算。**

Free & open-source local music player for Android and iOS.
**No built-in sources — it plays only the music you already own.**

</div>

> ⚠️ **项目状态：开发中，尚无可用版本。** C1（工程基座与核心播放能力）、C2（离线缓存）、C6（插件音源）已实现完毕，正在真机验证阶段——尚未在 iOS 与 Android 真机上跑通后台播放、锁屏控制、来电打断恢复与离线下载。下方标注为「待启动」的能力尚未实现。

## 这是什么

一个跨平台的**个人**音乐播放器。它解决两个问题：

- **核心播放能力被会员墙锁定** —— 播放你自己的歌不该需要订阅
- **曲目因版权变动无预警消失** —— 你已经在听的东西，不该某天打开就没了

做法是把「音源」和「播放器」彻底解耦：**应用本身不提供、不内置、不分发任何音源**。音乐由你自己准备，播放器负责把它们稳定地组织、检索和播放。

## 免责声明

**本应用不提供、不内置、不分发任何音乐资源，也不内置或默认指向任何音源站点、插件源。**

应用仅播放用户自行提供或自行指定的资源——你设备上的本地文件、你自己可访问的远程地址、你自己的网盘账号。用户需自行确保其所播放内容的合法性，并自行承担相应责任。项目维护者不对用户获取、存储或播放的任何内容负责。

## 规划中的能力

|        | 能力                                                               | 状态                        |
| ------ | ------------------------------------------------------------------ | --------------------------- |
| **C1** | 本地文件与远程 URL 播放 · 曲库与元数据 · 歌单 · 后台播放与锁屏控制 | 已实现，待真机验证          |
| **C2** | 离线缓存（手动下载曲目到本地，无网可听）                           | 已实现，待真机验证          |
| **C3** | 歌词显示（本地 `.lrc` 与内嵌歌词） · 播放历史                      | 待启动                      |
| **C4** | 曲库备份导出与导入                                                 | 待启动                      |
| **C5** | 115 网盘接入                                                       | 阻塞：开发者 API 权限审批中 |
| **C6** | 插件音源系统（**仅 Android**，见下）                               | 已实现，iOS 侧待验证        |

完整功能地图与路线图见 [`openspec/PRODUCT.md`](openspec/PRODUCT.md)。

**明确不做**：多设备同步、均衡器/音效、倍速播放、鸿蒙支持，以及——**内置任何音源**。理由见 PRODUCT.md。

### 关于插件音源（C6）

插件系统是 **Android 独占**能力。App Store 审核指南 2.5.2 与 2.3.1 使其无法在 iOS 上合规上架，因此它被设计为**编译期可裁剪模块**，iOS 构建中不包含相关代码。核心播放能力不依赖该模块——裁剪后的 iOS 版本仍是功能完整的播放器。

插件完全由用户自行获取和安装，本项目**不内置、不默认指向任何插件源**，也不提供任何插件市场、插件列表或推荐入口。从哪里获取插件、是否信任它，完全由使用者自行判断与承担。

**插件没有沙箱。** 插件代码由应用加载后在同一个 JavaScript 环境中执行，能力等同于应用自身代码——它可以访问网络，也可以读写本应用的数据。本项目不对插件行为做任何限制或审核，只在首次安装前明确告知这一点。

**插件可用的第三方库**（对插件作者是兼容性契约，只增不减；移除其中任何一项都会使既有插件失效）：

| 模块名        | 说明                                                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `axios`       | HTTP 请求                                                                                                                                                                        |
| `cheerio`     | HTML 解析。注入的是 `cheerio/slim` 构建（主入口依赖 Node 的 `undici`/`node:stream`，在 React Native 上无法打包），因此 `fromURL` 不可用——请改用 `axios` 取页面后再交给 `cheerio` |
| `crypto-js`   | 加解密与摘要                                                                                                                                                                     |
| `dayjs`       | 日期处理                                                                                                                                                                         |
| `big-integer` | 大整数运算                                                                                                                                                                       |
| `qs`          | 查询串序列化                                                                                                                                                                     |
| `he`          | HTML 实体编解码                                                                                                                                                                  |

只认这几个确切的模块名，不支持子路径引入（如 `crypto-js/md5`）。引入名单之外的模块会使该次调用失败，并向用户指明是哪个插件、缺哪个模块。

协议形状参考 [MusicFree](https://github.com/maotoumao/MusicFree) 的公开插件规范，以便既有插件可以直接复用。**仅参考协议规范，未复制其源代码**（MusicFree 为 AGPL-3.0）。

## 技术栈

版本均已锁定，升级随 Expo SDK 整体进行。

|                    | 版本       | 说明                                             |
| ------------------ | ---------- | ------------------------------------------------ |
| Expo SDK           | `~57.0.11` | Development Build 工作流，EAS Build 构建         |
| React Native       | `0.86.2`   | 新架构（SDK 55 起不可关闭）                      |
| TypeScript         | `~6.0.3`   | `strict` + `noUncheckedIndexedAccess`            |
| `expo-audio`       | `~57.0.3`  | 播放引擎、后台播放、锁屏与通知栏媒体会话         |
| `expo-sqlite`      | `~57.0.1`  | 曲库与歌单存储，`kv-store` 兼作配置持久化        |
| `expo-file-system` | `~57.0.2`  | 文件选择器、本地文件读取、封面落盘、离线缓存下载 |
| `music-metadata`   | `^11.14.0` | ID3v2 / Vorbis Comment / MP4 atom 元数据解析     |
| `expo-router`      | `~57.0.11` | 路由                                             |

包管理器为 **pnpm**（`.npmrc` 设置了 `node-linker=hoisted`，RN 的原生模块自动链接依赖扁平的 `node_modules` 布局）。

选型的完整决策记录（含备选方案与未采纳理由）见 [`design.md`](openspec/changes/bootstrap-music-player/design.md)。其中值得单独提一句的是播放引擎：本项目原定使用 `react-native-track-player`，但它在 v5 转为商业授权、开源的 v4 线随即冻结，与 GPL-3.0 分发冲突，因此在实施阶段改用 `expo-audio`。

## 开发

需要 Node ≥ 20 与 pnpm。**必须使用 Development Build**——`expo-audio` 是原生模块，Expo Go 无法加载。

```bash
pnpm install

# 真机 / 模拟器运行（首次会执行 prebuild 并编译原生工程）
pnpm ios
pnpm android

# 已有 dev build 时只起 Metro
pnpm start
```

云端构建（无需本地 Xcode 与 Android SDK）：

```bash
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
```

### 检查

```bash
pnpm typecheck           # tsc --noEmit
pnpm lint                # eslint（含 GPL 头部与分层约束规则）
pnpm format              # prettier --write
pnpm check:constraints   # 依赖许可证 + 核心能力不依赖插件实现
pnpm check:ios-strip     # 导出 iOS 产物，断言其中不含插件实现与插件专属依赖
pnpm test:cla            # CLA 工作流的桩测试
pnpm doctor              # expo-doctor
```

`pnpm check:constraints` 检查的是两条**长期**约束：依赖不得引入 GPL/LGPL/AGPL 或专有授权的库；核心能力不得依赖插件实现模块（否则 iOS 裁剪后无法交付完整功能）。破坏其中任何一条都会让 iOS 失去合规上架的前提，因此它是每次改依赖后都应该跑的检查，而不是一次性的。

`pnpm check:ios-strip` 是前一条在**产物层面**的验证：它真的导出一份 iOS 产物，读 source map 里的模块清单，断言插件宿主与 `cheerio` 等插件专属依赖确实不在其中。裁剪失效在运行时看不出任何差别——功能照常、界面照常，只有包体默默变大，而「iOS 包中不含可下载执行的代码」这一审核陈述不再成立。因此它必须靠检查产物来发现。耗时约一两分钟，改动插件模块或其引用关系后跑一次。

### 代码结构

```
src/domain     领域层：曲目与歌单模型、SQLite 迁移与仓储、配置持久化
src/sources    来源层：统一解析契约、来源注册表、唯一解析入口、本地文件 / 远程 URL
src/playback   播放层：播放控制、队列、播放模式、媒体会话、播放状态
src/library    曲库能力：元数据解析、封面提取与缓存、导入编排
src/cache      离线缓存：下载队列、缓存记录与文件、解析入口处的缓存命中
src/plugins    插件音源（仅 Android）：宿主、协议适配、生命周期、界面
src/ui         界面组件与设计令牌
src/app        expo-router 路由（保持极薄）
```

`src/plugins` 与其余部分之间只有一条通路：`src/plugins/index.ts` 门面（以及 `screens/` 下的屏幕模块）。两者都有 `.android` 对应文件，iOS 解析到的是空实现——插件实现与其依赖因此根本不出现在 iOS 的模块图里。ESLint 禁止其余代码直接引用插件实现模块。

分层约定与依赖方向见 [`docs/architecture.md`](docs/architecture.md)。**上层可以依赖下层，下层不得依赖上层**；播放层不得感知具体来源，这条由 ESLint 强制执行。

## 贡献

欢迎提 Issue 和 PR。**提交 PR 前需先签署 [CLA](CLA.md)**（约 30 秒，只需一次）。

需要 CLA 的原因很具体：本项目以 GPL-3.0 开源，同时要上架 App Store，而 GPL-3.0 与 App Store 的分发条款存在冲突。维护者作为版权持有人可以为自己的代码做出额外授权，但无权替你的代码这么做——没有 CLA，任何一个外部贡献都会导致 iOS 版本无法合规上架。CLA 不索取你的版权，你完整保留自己贡献的著作权。

另有一条硬约束请注意：**不要引入 GPL / LGPL / AGPL 或专有授权的第三方库**，同样会阻断上架。新增依赖后请跑 `pnpm check:constraints`。

`main` 已开启分支保护，`CLA` 是必需状态检查——未签署的 PR 无法合并。

详细的贡献流程（含源文件 GPL 头部要求）见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

本项目采用 **[GPL-3.0](LICENSE)** 许可证。

这意味着你可以自由地使用、修改和分发本项目，但**基于本项目的衍生作品必须同样以 GPL-3.0 开源**。

版权由 `li1164267803` 独家持有（外部贡献通过 [CLA](CLA.md) 授权）。维护者据此为应用商店发行版本做出必要的额外授权——这是 GPL 项目能够合规上架 iOS 的前提，也是 VLC 当年在 App Store 遇到问题的症结所在。

本项目参考了 [MusicFree](https://github.com/maotoumao/MusicFree)（AGPL-3.0）的**插件协议规范与设计思路**，但**未复制其任何源代码**。接口定义本身不受版权保护。
