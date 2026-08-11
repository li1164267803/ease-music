// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

/**
 * 验证 iOS 产物中不存在插件宿主与插件专属依赖（add-plugin-source-system/design.md 决策 6）。
 *
 * **裁剪失效在运行时看不出任何差别**——功能照常、界面照常，只有包体默默变大，而
 * 「iOS 包中不含可下载执行的代码」这一审核陈述不再成立。因此只能靠检查产物发现，
 * 也因此必须是一条可重复执行的检查，而不是实施时看一眼就算数。
 *
 * 做法：走官方的 `expo export` 导出 iOS 产物并带上 source map，然后读 map 里的
 * `sources`——那是这份产物真实包含的全部模块路径。比在压缩后的 bundle 里猜特征
 * 字符串可靠得多，也比自己拼 Metro 配置更贴近真实的构建管线。
 *
 * 用法：pnpm check:ios-strip
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, '.ios-strip-check');

/** 只为插件服务的第三方依赖。任何一项出现在 iOS 产物里都是纯粹的包体浪费。 */
const PLUGIN_ONLY_DEPENDENCIES = [
  'axios',
  'cheerio',
  'crypto-js',
  'dayjs',
  'big-integer',
  'qs',
  'he',
];

/** 插件实现。`src/plugins/index.ts`（平台中立的空门面）与 `api.ts`（纯类型）不在此列。 */
const PLUGIN_IMPLEMENTATION = [
  'src/plugins/host/',
  'src/plugins/store/',
  'src/plugins/ui/',
  'src/plugins/manager.ts',
  'src/plugins/search.ts',
  'src/plugins/source.ts',
  'src/plugins/candidate.ts',
  'src/plugins/screens/manage.android.tsx',
  'src/plugins/screens/search.android.tsx',
];

rmSync(OUTPUT_DIR, { recursive: true, force: true });

console.log('导出 iOS 产物（带 source map，用于断言模块构成）……');
execFileSync(
  'npx',
  [
    'expo',
    'export',
    '--platform',
    'ios',
    '--output-dir',
    OUTPUT_DIR,
    '--source-maps',
    '--no-bytecode',
  ],
  { cwd: PROJECT_ROOT, stdio: 'inherit' },
);

const sources = collectSources(path.join(OUTPUT_DIR, '_expo/static/js/ios'));
rmSync(OUTPUT_DIR, { recursive: true, force: true });

if (sources.length === 0) {
  console.log('\n✗ 没有从产物中读到任何模块路径，本次检查无效。');
  process.exit(1);
}
console.log(`\n产物包含 ${sources.length} 个模块。`);

const problems = [];

console.log('\n插件专属依赖：');
for (const name of PLUGIN_ONLY_DEPENDENCIES) {
  const hit = sources.find((source) => source.includes(`/node_modules/${name}/`));
  console.log(`  ${hit ? '✗' : '·'} ${name}${hit ? ` → ${hit}` : ''}`);
  if (hit) problems.push(`插件专属依赖 ${name} 进入了 iOS 产物（决策 6）`);
}

console.log('\n插件实现模块：');
for (const marker of PLUGIN_IMPLEMENTATION) {
  const hit = sources.find((source) => source.includes(marker));
  console.log(`  ${hit ? '✗' : '·'} ${marker}`);
  if (hit) problems.push(`插件实现模块 ${marker} 进入了 iOS 产物（决策 6）`);
}

// 反证：平台中立的空门面必须在产物里。它都不在，说明这份产物根本没打到应用代码，
// 上面的「全部不存在」就是假阴性。
const facade = sources.some((source) => source.includes('src/plugins/index.ts'));
console.log(`\n平台中立门面（应存在）：${facade ? '· 在' : '✗ 不在'}`);
if (!facade) problems.push('iOS 产物里连平台中立门面都没有，本次检查无效');

console.log(
  problems.length === 0
    ? '\n✅ iOS 产物不含插件实现与插件专属依赖。'
    : `\n✗ ${problems.length} 项问题：`,
);
for (const problem of problems) console.log(`  - ${problem}`);
process.exit(problems.length === 0 ? 0 : 1);

function collectSources(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.map')) continue;
    const map = JSON.parse(readFileSync(path.join(directory, entry.name), 'utf8'));
    found.push(...(map.sources ?? []));
  }
  return found;
}
