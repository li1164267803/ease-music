// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

/**
 * CLA 签署检查。由 `.github/workflows/cla.yml` 经 actions/github-script 调用，
 * 直接使用其内置的 Octokit（GitHub 官方 SDK），不依赖任何第三方 action。
 *
 * 自己实现而不是用 contributor-assistant/github-action 的理由有两条：
 *
 * 1. **不需要 PAT。** 那个 action 要求配置一个具备 repo 权限的个人访问令牌，是因为
 *    它把签署记录写进仓库的方式绕过了 GITHUB_TOKEN。而 `pull_request_target` 与
 *    `issue_comment` 都在**基仓库**上下文中运行，GITHUB_TOKEN 本就拥有基仓库的写
 *    权限，声明 `permissions: contents: write` 即可。少一个需要人工创建、会过期、
 *    泄漏后等同于账号失守的长期凭据。
 * 2. **少一个第三方依赖。** CLA 是本项目 iOS 合规上架的前提（design.md 决策 9
 *    派生约束 1），把它托管在一个第三方 action 上，等于把这条约束的可用性交给别人。
 *
 * 签署记录存放在孤儿分支 `cla-signatures` 的 `signatures.json` 中——孤儿分支不含
 * 主线的任何历史，只有这一个文件，既不污染 main 的提交历史，也便于审计。
 *
 * 安全性：本脚本在 `pull_request_target` 下以写权限运行，因此**绝不检出、也绝不执行
 * PR 的代码**。工作流中的 checkout 取的是基分支，脚本本身只调用 API。
 */

const SIGN_PHRASE = 'I have read the CLA Document and I hereby sign the CLA';
const RECHECK_PHRASE = 'recheck';
const BRANCH = 'cla-signatures';
const FILE_PATH = 'signatures.json';
const STATUS_CONTEXT = 'CLA';
const MARKER = '<!-- easemusic-cla -->';

/** 无需签署的账号：维护者本人（版权持有人）与机器人。 */
const ALLOWLIST = new Set(['li1164267803']);

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const claUrl = `https://github.com/${owner}/${repo}/blob/main/CLA.md`;

  const pullNumber = resolvePullNumber(context);
  if (pullNumber === null) {
    core.info('该事件不属于任何 PR，跳过。');
    return;
  }

  const { data: pull } = await github.rest.pulls.get({ owner, repo, pull_number: pullNumber });
  if (pull.state !== 'open') {
    core.info(`PR #${pullNumber} 已关闭，跳过。`);
    return;
  }

  let store = await readSignatures(github, owner, repo, core);

  // 有人回复了签署语句：记录下来。允许任何人签署，不限于本 PR 的贡献者——
  // 签署是对个人的一次性授权，提前签并不奇怪。
  const comment = context.payload.comment;
  if (comment && isSignature(comment.body)) {
    store = await recordSignature(github, owner, repo, store, comment, pullNumber, core);
  }

  const contributors = await collectContributors(github, owner, repo, pullNumber, pull);
  const signedIds = new Set(store.data.signatures.map((entry) => entry.id));
  const unsigned = contributors.filter((person) => !signedIds.has(person.id));

  await upsertComment(github, owner, repo, pullNumber, unsigned, claUrl);

  await github.rest.repos.createCommitStatus({
    owner,
    repo,
    sha: pull.head.sha,
    context: STATUS_CONTEXT,
    state: unsigned.length === 0 ? 'success' : 'failure',
    description:
      unsigned.length === 0 ? '所有贡献者均已签署 CLA' : `${unsigned.length} 位贡献者尚未签署 CLA`,
    target_url: claUrl,
  });

  if (unsigned.length > 0) {
    core.setFailed(`尚未签署 CLA：${unsigned.map((person) => person.login).join('、')}`);
  } else {
    core.info('所有贡献者均已签署 CLA。');
  }
};

function resolvePullNumber(context) {
  if (context.eventName === 'pull_request_target') return context.payload.pull_request.number;
  // issue_comment 同时覆盖 issue 与 PR，只有带 pull_request 字段的才是 PR 上的评论
  if (context.eventName === 'issue_comment' && context.payload.issue.pull_request) {
    return context.payload.issue.number;
  }
  return null;
}

function isSignature(body) {
  return typeof body === 'string' && body.trim().startsWith(SIGN_PHRASE);
}

function isBot(user) {
  return !user || user.type === 'Bot' || user.login.endsWith('[bot]');
}

/**
 * 收集本 PR 需要签署 CLA 的人：PR 作者，加上每个提交的作者。
 *
 * 记录并以数字 id 作为身份依据而非 login——GitHub 允许改名，改名后旧 login 还可能
 * 被别人注册。用 login 判定签署状态，等于把授权绑在一个可转让的字符串上。
 */
async function collectContributors(github, owner, repo, pullNumber, pull) {
  const commits = await github.paginate(github.rest.pulls.listCommits, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  const people = new Map();
  const add = (user) => {
    if (isBot(user) || ALLOWLIST.has(user.login)) return;
    people.set(user.id, { id: user.id, login: user.login });
  };

  add(pull.user);
  for (const commit of commits) {
    // author 为 null 表示提交邮箱未关联任何 GitHub 账号，无法归属到具体的人。
    // 此时以 PR 作者为准即可——他有责任保证自己提交的内容可被授权。
    if (commit.author) add(commit.author);
  }

  return [...people.values()];
}

async function readSignatures(github, owner, repo, core) {
  try {
    const { data } = await github.rest.repos.getContent({
      owner,
      repo,
      path: FILE_PATH,
      ref: BRANCH,
    });
    return {
      sha: data.sha,
      data: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')),
    };
  } catch (error) {
    // 分支或文件不存在时返回 404，视为「还没有任何签署记录」
    if (error.status !== 404) throw error;
    core.info('尚无签署记录文件，将在首次签署时创建。');
    return { sha: null, data: { signatures: [] } };
  }
}

async function recordSignature(github, owner, repo, store, comment, pullNumber, core) {
  const user = comment.user;
  if (isBot(user)) return store;
  if (store.data.signatures.some((entry) => entry.id === user.id)) {
    core.info(`${user.login} 此前已签署，跳过写入。`);
    return store;
  }

  const signatures = [
    ...store.data.signatures,
    {
      id: user.id,
      login: user.login,
      signedAt: comment.created_at,
      pullRequest: pullNumber,
      commentId: comment.id,
    },
  ];
  const next = { signatures };
  const content = Buffer.from(`${JSON.stringify(next, null, 2)}\n`, 'utf8').toString('base64');
  const message = `chore(cla): ${user.login} 签署 CLA (#${pullNumber})`;

  if (store.sha === null) {
    await createOrphanBranch(github, owner, repo, content, message);
  } else {
    await github.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: FILE_PATH,
      branch: BRANCH,
      sha: store.sha,
      message,
      content,
    });
  }

  core.info(`已记录 ${user.login} 的签署。`);
  // sha 已失效，但本次运行后续只读 data，不再写入
  return { sha: null, data: next };
}

/**
 * 建立只含签署记录文件的孤儿分支：空 parents 的提交 + 只有一个 blob 的树。
 * 不从 main 拉分支，是为了让这个分支与代码历史完全无关，日后谁来看都一目了然。
 */
async function createOrphanBranch(github, owner, repo, content, message) {
  const blob = await github.rest.git.createBlob({ owner, repo, content, encoding: 'base64' });
  const tree = await github.rest.git.createTree({
    owner,
    repo,
    tree: [{ path: FILE_PATH, mode: '100644', type: 'blob', sha: blob.data.sha }],
  });
  const commit = await github.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.data.sha,
    parents: [],
  });
  await github.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${BRANCH}`,
    sha: commit.data.sha,
  });
}

/**
 * 维护 PR 中唯一一条状态评论：更新而不是每次追加，避免刷屏。
 * 靠隐藏标记定位自己的评论，而不是靠作者判定——同一个 GITHUB_TOKEN 发的评论
 * 未必只有这一条。
 */
async function upsertComment(github, owner, repo, pullNumber, unsigned, claUrl) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: pullNumber,
    per_page: 100,
  });
  const existing = comments.find((comment) => comment.body?.includes(MARKER));

  // 全员已签且此前没提示过，就什么都不发：提交状态已经表达了结果，
  // 再贴一条「✅ 已签署」只是噪音——维护者自己开的 PR 每次都会被贴一条。
  if (unsigned.length === 0 && !existing) return;

  const body = unsigned.length === 0 ? signedBody() : pendingBody(unsigned, claUrl);

  if (existing) {
    if (existing.body === body) return;
    await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    return;
  }
  await github.rest.issues.createComment({ owner, repo, issue_number: pullNumber, body });
}

function pendingBody(unsigned, claUrl) {
  const names = unsigned.map((person) => `@${person.login}`).join(' ');
  return `${MARKER}
${names}，感谢你的贡献！合并前需要签署一次 [CLA](${claUrl})——只需一次，之后所有 PR 都不再提示。

原因很具体：本项目以 GPL-3.0 开源，同时要上架 App Store，而两者的分发条款存在冲突。维护者作为版权持有人可以为自己的代码做出额外授权，但**无权替你的代码这么做**——没有 CLA，任何一个外部贡献都会导致 iOS 版本无法合规上架。CLA 不索取你的版权，你完整保留自己贡献的著作权。

请阅读 [CLA.md](${claUrl})，然后在本 PR 中回复下面这一行（原样复制）：

\`\`\`
${SIGN_PHRASE}
\`\`\`

如果检查状态没有及时更新，回复 \`${RECHECK_PHRASE}\` 可以重新检查。`;
}

function signedBody() {
  return `${MARKER}
✅ 本 PR 的所有贡献者均已签署 CLA。`;
}
