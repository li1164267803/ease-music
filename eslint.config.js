// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

const gplHeader = require('./tools/eslint-rules/gpl-header');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    // expo-env.d.ts 由 expo 自动生成，不受 GPL 头部与代码规范约束
    ignores: ['dist/*', 'android/*', 'ios/*', 'openspec/*', 'expo-env.d.ts'],
  },
  {
    plugins: { easemusic: { rules: { 'gpl-header': gplHeader } } },
    rules: { 'easemusic/gpl-header': 'error' },
  },
  {
    // 这些脚本跑在 Node 里（本地命令行与 GitHub Actions），不在 React Native 运行时里，
    // 因此需要 Node 的全局对象——基础配置只提供 RN/浏览器那一套。
    files: ['tools/**', '.github/scripts/**'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  {
    // media-source spec：播放器 MUST NOT 依赖任何特定来源的私有字段或私有行为。
    //
    // 只约束播放层，不约束导入流程与 UI——导入本来就是来源特有的动作（本地文件要开
    // 文件选择器，远程地址要校验 URL），把它们一并禁掉只会逼出绕过规则的写法。真正
    // 必须来源无关的是播放：它只能拿到「地址 + 请求头 + UA」这一个形状。
    files: ['src/playback/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/sources/*', '!@/sources/contract', '!@/sources/resolve'],
              message:
                '播放层不得感知具体来源。只能通过 @/sources/resolve 取地址、@/sources/contract 取类型。',
            },
          ],
        },
      ],
    },
  },
]);
