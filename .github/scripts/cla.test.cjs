// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 琥珀音乐 AmberMusic

/**
 * 用桩 Octokit 跑 cla.cjs 的真实控制流。
 *
 * CLA 工作流没有别的验证方式——只能靠开真 PR 去试，而它又是 iOS 合规上架的前提
 * （design.md 决策 9 派生约束 1）。与其每次改动都去线上试错，不如把 Octokit 桩起来
 * 直接跑逻辑。用 node:assert 而非测试框架，是为了不给仓库增加测试依赖。
 *
 * 用法：pnpm test:cla
 */

const assert = require('node:assert');
const cla = require('./cla.cjs');

function makeWorld({ signatures = null, comments = [], commits = [], pull } = {}) {
  const world = {
    signatures, // null 表示分支/文件不存在
    comments: [...comments],
    branchCreated: false,
    statuses: [],
    log: [],
  };

  const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });

  const github = {
    paginate: async (method, params) => (await method(params)).data,
    rest: {
      pulls: {
        get: async () => ({ data: pull }),
        listCommits: async () => ({ data: commits }),
      },
      repos: {
        getContent: async () => {
          if (world.signatures === null) throw notFound();
          return {
            data: {
              sha: 'sha-existing',
              content: Buffer.from(JSON.stringify(world.signatures)).toString('base64'),
            },
          };
        },
        createOrUpdateFileContents: async ({ sha, content, message }) => {
          assert.equal(sha, 'sha-existing', ' 应带上既有文件的 sha 以避免覆盖');
          world.signatures = JSON.parse(Buffer.from(content, 'base64').toString('utf8'));
          world.log.push(`update:${message}`);
          return { data: {} };
        },
        createCommitStatus: async (params) => {
          world.statuses.push(params);
          return { data: {} };
        },
      },
      git: {
        createBlob: async ({ content }) => {
          world.pendingContent = content;
          return { data: { sha: 'blob1' } };
        },
        createTree: async ({ tree }) => {
          assert.equal(tree.length, 1, '孤儿树只应包含签署文件');
          assert.equal(tree[0].path, 'signatures.json');
          return { data: { sha: 'tree1' } };
        },
        createCommit: async ({ parents, message }) => {
          assert.deepEqual(parents, [], '必须是无父提交（孤儿分支）');
          world.log.push(`orphan:${message}`);
          return { data: { sha: 'commit1' } };
        },
        createRef: async ({ ref }) => {
          assert.equal(ref, 'refs/heads/cla-signatures');
          world.branchCreated = true;
          world.signatures = JSON.parse(
            Buffer.from(world.pendingContent, 'base64').toString('utf8'),
          );
          return { data: {} };
        },
      },
      issues: {
        listComments: async () => ({ data: world.comments }),
        createComment: async ({ body }) => {
          world.comments.push({
            id: 900,
            body,
            user: { login: 'github-actions[bot]', type: 'Bot' },
          });
          world.log.push('comment:create');
          return { data: {} };
        },
        updateComment: async ({ comment_id, body }) => {
          world.comments.find((c) => c.id === comment_id).body = body;
          world.log.push('comment:update');
          return { data: {} };
        },
      },
    },
  };

  return { world, github };
}

const core = { info: () => {}, setFailed: (m) => (core.failure = m) };
const freshCore = () => ({
  info: () => {},
  setFailed(m) {
    this.failure = m;
  },
});

const CTX = (payload, eventName) => ({
  eventName,
  repo: { owner: 'li1164267803', repo: 'amber-music' },
  payload,
});
const PULL = {
  number: 7,
  state: 'open',
  head: { sha: 'headsha' },
  user: { id: 42, login: 'alice', type: 'User' },
};

async function run(name, { context, ...opts }) {
  const { world, github } = makeWorld(opts);
  const c = freshCore();
  await cla({ github, context, core: c });
  console.log(`\n=== ${name} ===`);
  console.log(
    '  status  :',
    world.statuses.map((s) => `${s.context}=${s.state} (${s.description})`).join('') || '(无)',
  );
  console.log('  actions :', world.log.join(', ') || '(无)');
  console.log('  签署记录:', JSON.stringify(world.signatures));
  console.log('  setFailed:', c.failure ?? '(未失败)');
  return { world, core: c };
}

(async () => {
  // 1. 新 PR，作者未签，签署文件尚不存在
  let r = await run('新 PR / 未签署', {
    context: CTX({ pull_request: { number: 7 } }, 'pull_request_target'),
    pull: PULL,
    commits: [{ author: { id: 42, login: 'alice', type: 'User' } }],
  });
  assert.equal(r.world.statuses[0].state, 'failure');
  assert.ok(r.world.comments[0].body.includes('@alice'));
  assert.ok(r.core.failure.includes('alice'));

  // 2. 作者回复签署语句 → 建孤儿分支并记录
  r = await run('回复签署语句', {
    context: CTX(
      {
        issue: { number: 7, pull_request: {} },
        comment: {
          id: 111,
          created_at: '2026-08-07T10:00:00Z',
          body: 'I have read the CLA Document and I hereby sign the CLA',
          user: { id: 42, login: 'alice', type: 'User' },
        },
      },
      'issue_comment',
    ),
    pull: PULL,
    commits: [{ author: { id: 42, login: 'alice', type: 'User' } }],
    comments: [{ id: 900, body: '<!-- ambermusic-cla -->\n@alice ...', user: {} }],
  });
  assert.equal(r.world.branchCreated, true, '应创建孤儿分支');
  assert.equal(r.world.statuses[0].state, 'success');
  assert.equal(r.world.signatures.signatures[0].id, 42);
  assert.ok(r.world.log.includes('comment:update'), '应更新既有评论而不是新建');

  // 3. 已有签署记录，再开一个 PR
  r = await run('已签署者的新 PR（不应有评论）', {
    context: CTX({ pull_request: { number: 7 } }, 'pull_request_target'),
    pull: PULL,
    commits: [{ author: { id: 42, login: 'alice', type: 'User' } }],
    signatures: { signatures: [{ id: 42, login: 'alice' }] },
  });
  assert.equal(r.world.statuses[0].state, 'success');
  assert.equal(r.core.failure, undefined);
  assert.equal(r.world.comments.length, 0, '已签署且无历史提示时不应新建评论');

  // 4. 改名攻击：签署记录里的 login 变了，但 id 未变 → 仍视为已签
  r = await run('贡献者改名（id 不变）', {
    context: CTX({ pull_request: { number: 7 } }, 'pull_request_target'),
    pull: { ...PULL, user: { id: 42, login: 'alice-renamed', type: 'User' } },
    commits: [{ author: { id: 42, login: 'alice-renamed', type: 'User' } }],
    signatures: { signatures: [{ id: 42, login: 'alice' }] },
  });
  assert.equal(r.world.statuses[0].state, 'success', '身份应以数字 id 为准');

  // 5. 别人抢注了旧 login → 不应被认作已签
  r = await run('旧 login 被他人注册', {
    context: CTX({ pull_request: { number: 7 } }, 'pull_request_target'),
    pull: { ...PULL, user: { id: 999, login: 'alice', type: 'User' } },
    commits: [{ author: { id: 999, login: 'alice', type: 'User' } }],
    signatures: { signatures: [{ id: 42, login: 'alice' }] },
  });
  assert.equal(r.world.statuses[0].state, 'failure', 'login 相同但 id 不同不应放行');

  // 6. 机器人与维护者本人不需要签署
  r = await run('机器人 + 维护者', {
    context: CTX({ pull_request: { number: 7 } }, 'pull_request_target'),
    pull: { ...PULL, user: { id: 1, login: 'li1164267803', type: 'User' } },
    commits: [
      { author: { id: 1, login: 'li1164267803', type: 'User' } },
      { author: { id: 2, login: 'dependabot[bot]', type: 'Bot' } },
      { author: null },
    ],
  });
  assert.equal(r.world.statuses[0].state, 'success');
  assert.equal(r.world.comments.length, 0, '无人需要签署时不应发评论');

  // 7. 普通 issue 的评论 → 完全跳过
  const { world, github } = makeWorld({ pull: PULL });
  await cla({
    github,
    context: CTX({ issue: { number: 3 }, comment: { body: 'hi' } }, 'issue_comment'),
    core: freshCore(),
  });
  console.log('\n=== 非 PR 的 issue 评论 ===');
  console.log('  status  :', world.statuses.length === 0 ? '(未设置，符合预期)' : '意外设置了状态');
  assert.equal(world.statuses.length, 0);

  // 8. 共同作者未签 → 也要拦住
  r = await run('共同作者未签署', {
    context: CTX({ pull_request: { number: 7 } }, 'pull_request_target'),
    pull: PULL,
    commits: [
      { author: { id: 42, login: 'alice', type: 'User' } },
      { author: { id: 77, login: 'bob', type: 'User' } },
    ],
    signatures: { signatures: [{ id: 42, login: 'alice' }] },
  });
  assert.equal(r.world.statuses[0].state, 'failure');
  assert.ok(r.core.failure.includes('bob'));

  console.log('\n✅ 全部 8 个场景通过');
})();
