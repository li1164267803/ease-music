// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

/**
 * 把 design.md 决策 7 与决策 9 的两条**持续约束**变成可重复执行的检查。
 *
 * 它们不是一次性检查项：任何一次新增依赖、任何一次为图省事把插件能力写进核心路径，
 * 都会让 iOS 失去合规上架的前提。放进 CI 比放进人的记忆里可靠。
 *
 * 用法：pnpm check:constraints
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const problems = [];

// ── 决策 9 约束 2：依赖不得引入 GPL / LGPL / AGPL 或专有授权的第三方库 ──
// CLA 只能解决贡献者的代码，解决不了第三方库——维护者无权替他人的库向 Apple 做额外授权。
// 专有授权（含「个人免费、商用付费」）同样致命：它与 GPL-3.0 分发冲突，并断绝 F-Droid。
const FORBIDDEN = /\b(A?GPL|LGPL)\b|SEE LICENSE/i;

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

console.log('依赖许可证：');
for (const name of Object.keys(pkg.dependencies ?? {})) {
  let license = '未声明';
  try {
    license = require(`${name}/package.json`).license ?? '未声明';
  } catch {
    license = '无法读取';
  }
  const flagged = FORBIDDEN.test(String(license)) || license === '未声明';
  console.log(`  ${flagged ? '✗' : '·'} ${name.padEnd(34)} ${license}`);
  if (flagged)
    problems.push(`依赖 ${name} 的许可证为「${license}」，需人工复核（design.md 决策 9 约束 2）`);
}

// ── 决策 7：核心能力不得依赖插件模块，iOS 裁剪插件后仍为功能完整的播放器 ──
//
// 裁剪的实现方式在 add-plugin-source-system/design.md 决策 6 中定稿：不是从构建里剔除
// 目录，而是用平台后缀文件切断引用链。因此核心路径**可以**引用 `@/plugins` 门面与
// `@/plugins/screens/*`——它们在 iOS 侧解析到的是空实现；不可以引用的是插件实现模块，
// 那才会把宿主代码与 cheerio 等专属依赖拖进 iOS 产物。
//
// 本检查只看引用层面。裁剪是否真的生效必须看产物：`pnpm check:ios-strip`。
const CORE = ['src/domain', 'src/sources', 'src/playback', 'src/library', 'src/ui', 'src/app'];
let pluginRefs = '';
try {
  pluginRefs = execSync(
    `grep -rn "from '@/plugins/" ${CORE.join(' ')} --include="*.ts" --include="*.tsx" | grep -v "@/plugins/screens/" || true`,
    { encoding: 'utf8' },
  ).trim();
} catch {
  pluginRefs = '';
}

console.log('\n核心路径对插件实现模块的引用：');
if (pluginRefs) {
  console.log(pluginRefs);
  problems.push('核心能力引用了插件实现模块，iOS 裁剪后将无法交付完整功能（design.md 决策 7）');
} else {
  console.log('  · 无（门面与屏幕模块的引用是允许的，见上方说明）');
}

console.log(
  problems.length === 0 ? '\n✅ 两条持续约束均满足。' : `\n✗ ${problems.length} 项问题：`,
);
for (const problem of problems) console.log(`  - ${problem}`);
process.exit(problems.length === 0 ? 0 : 1);
