# 贡献指南

欢迎提 Issue 和 PR。开始之前有三件事需要知道。

## 1. 先签 CLA

**提交 PR 前需先签署 [CLA](CLA.md)**，只需一次。PR 打开后机器人会自动检查签署状态，未签署时会在 PR 中留言并给出签署方式——在 PR 里回复它指定的那一行即可。

原因见 [CLA.md](CLA.md) 的开头：本项目以 GPL-3.0 开源，同时要上架 App Store，二者的分发条款存在冲突。维护者作为版权持有人可以为自己的代码做出额外授权，但无权替你的代码这么做。CLA 不索取你的版权，你完整保留自己贡献的著作权。

## 2. 不要引入 GPL / LGPL / AGPL 授权的第三方库

CLA 只能解决贡献者的代码，解决不了第三方库——维护者无权替他人的 GPL 库向 Apple 做额外授权。同理，**专有授权（含「个人免费、商用付费」）的库也不可引入**，它与 GPL-3.0 分发直接冲突，并会断绝 F-Droid 收录。

新增任何依赖前请在 PR 描述中注明其许可证。当前技术栈是安全的：Expo 系为 MIT，`expo-audio`、`expo-sqlite` 为 MIT。

> 这不是假设性风险。`react-native-track-player` 曾是本项目的既定播放引擎，它在 v5 转为商业授权、开源的 v4 线随即冻结——本项目因此在实施阶段更换了播放引擎，详见 [design.md 决策 3](openspec/changes/bootstrap-music-player/design.md)。

## 3. 源文件头部需附 GPL 声明块

每个 `.ts` / `.tsx` 源文件的头部需以下面两行开始：

```ts
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 琥珀音乐 AmberMusic
```

版权人固定写维护者本人——依 CLA，外部贡献经授权后由维护者作为唯一版权持有人对外分发，这是 iOS 合规上架的前提，因此这一行不随贡献者变化。

该约束由 ESLint 强制执行（规则 `ambermusic/gpl-header`，实现在 `tools/eslint-rules/`），**可自动修复**：

```bash
pnpm lint --fix
```

## 开发流程

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm format      # prettier --write
```

代码分层约定见 [`docs/architecture.md`](docs/architecture.md)。**任何新增代码都必须能被归入其中某一层，且不得反向依赖。**

本项目使用 [OpenSpec](openspec/) 管理需求与设计。改动行为的 PR 请先在对应的 change 中说明，不要让代码与 spec 脱节。

---

### 维护者须知：CLA 工作流

`.github/workflows/cla.yml` 调用 `.github/scripts/cla.cjs`，经官方的 `actions/github-script` 使用其内置的 Octokit（GitHub 官方 SDK）实现，**不依赖任何第三方 action，也不需要配置 PAT**。

`pull_request_target` 与 `issue_comment` 都在**基仓库**上下文中运行，`GITHUB_TOKEN` 本就拥有基仓库的写权限，工作流里声明 `permissions` 即可。签署记录写入孤儿分支 `cla-signatures` 的 `signatures.json`（首次签署时自动创建该分支），不污染 `main` 的提交历史。

签署身份以 GitHub 的**数字用户 id** 为准而非 login——login 可以改名，且旧 login 可被他人重新注册。

#### 仓库侧已配置的两项（无需再动）

| 设置 | 当前值 | 作用 |
|---|---|---|
| Actions → Workflow permissions | `write` | GITHUB_TOKEN 的**默认**权限。本工作流已显式声明 `permissions`，这项只是兜底 |
| `main` 分支保护 → 必需状态检查 | `CLA` | 未签署的 PR 在 GitHub UI 上直接无法合并，不依赖人记得看 |

分支保护刻意保留的三项，都是为了不把单人项目的日常操作卡死：

- **`enforce_admins: false`** —— 你作为管理员**仍可直接往 `main` 推送**，日常开发不受影响；万一工作流本身出故障导致检查一直不出结果，你也能手动合并，不会被自己锁在门外。
- **`strict: false`** —— 不要求 PR 分支与 `main` 保持最新，否则 `main` 每次有提交都要贡献者重新 rebase。
- **不要求 PR 评审** —— 单人项目，开了就没人能合并自己的 PR。

需要撤销时：

```bash
# 取消 main 的分支保护
gh api --method DELETE repos/li1164267803/amber-music/branches/main/protection

# 把 workflow 默认权限调回只读
gh api --method PUT repos/li1164267803/amber-music/actions/permissions/workflow \
  -F default_workflow_permissions=read
```

> ℹ️ 该工作流尚未在真实 PR 上跑过。第一个外部 PR 会是它的首次实战，届时留意 Actions 日志；若检查一直停在 pending，多半是工作流没被触发，而不是签署没被记录。

工作流逻辑有桩测试覆盖（Octokit 被打桩，跑 8 个场景：未签署、签署、改名、旧 login 被抢注、机器人、共同作者等）：

```bash
pnpm test:cla
```

改动 `cla.cjs` 后请跑一遍——这个工作流除此之外只能靠开真 PR 试错，而它是 iOS 合规上架的前提（design.md 决策 9 派生约束 1）。

> ⚠️ 安全提示：该工作流在 `pull_request_target` 下持有写权限，因此**绝不能检出或执行 PR 提交的代码**。工作流里的 `actions/checkout` 取的是基分支且只取 `.github/scripts`，脚本本身只调用 API。修改工作流时请守住这条。
