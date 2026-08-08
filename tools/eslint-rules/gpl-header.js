// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

/**
 * design.md 决策 9 要求每个源文件头部附 GPL 声明块。用本地规则而非第三方插件实现，
 * 一是避免为一条格式约束引入依赖，二是每新增一个依赖都需核查许可证（同为决策 9 的约束）。
 *
 * 声明块采用 SPDX 短标识 + 单一版权人两行形式：SPDX 可被 GitHub、F-Droid 与各类
 * 许可证扫描器直接识别；版权人写死为维护者本人，对应决策 9「维护者必须始终是唯一
 * 版权持有人」——外部贡献经由 CLA 授权，不改变这一行。
 */

const SPDX_LINE = '// SPDX-License-Identifier: GPL-3.0-or-later';
const COPYRIGHT_LINE = '// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic';
const HEADER = `${SPDX_LINE}\n${COPYRIGHT_LINE}\n`;

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'layout',
    docs: { description: '要求源文件头部附 GPL-3.0 声明块' },
    fixable: 'whitespace',
    schema: [],
    messages: {
      missing: '源文件头部缺少 GPL-3.0 声明块（见 CONTRIBUTING.md）。',
    },
  },
  create(context) {
    return {
      Program(node) {
        const source = context.sourceCode;
        const [first] = source.getAllComments();
        if (first && first.type === 'Line' && source.getText(first).trim() === SPDX_LINE) {
          return;
        }
        context.report({
          node,
          messageId: 'missing',
          fix: (fixer) => fixer.insertTextBeforeRange([0, 0], HEADER),
        });
      },
    };
  },
};
