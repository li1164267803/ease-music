// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

/**
 * 让 Node 直接跑仓库里的 TypeScript 单测。
 *
 * Node 22 自带类型擦除，唯一缺的是 tsconfig 里的 `@/*` 别名——Metro 认它，Node 不认。
 * 这里只补这一件事，不引入测试框架也不引入构建步骤（与 `cla.test.cjs` 同一取舍：
 * 不给仓库增加测试依赖）。
 *
 * 用法：node --import ./tools/ts-alias.mjs <文件.ts>
 */

import { existsSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context);

    const base = path.join(SRC, specifier.slice(2));
    for (const candidate of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
