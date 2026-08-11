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
    // add-plugin-source-system/design.md 决策 6：iOS 侧根本不存在通向插件实现的 import，
    // 插件宿主与 `cheerio` 等专属依赖才不会进入 iOS 产物。打包器按静态 import 关系收集
    // 模块，与代码是否可达无关——因此这条约束只能靠「不许写这一行 import」来守。
    //
    // 允许的只有两个平台分界点：`@/plugins` 门面与 `@/plugins/screens/*` 屏幕模块，
    // 两者都有 `.android` 对应文件，iOS 解析到的是空实现。
    //
    // 这是引用层面的静态约束；产物层面的真实验证是 `pnpm check:ios-strip`，两者都要有——
    // 规则挡住日常的手滑，产物检查才能证明裁剪真的生效。
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/plugins/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // 逐个列出实现模块而不是「禁 @/plugins/* 再放行 screens」：gitignore 语义下
              // 被排除的目录里的文件无法再被重新放行，那种写法看着对，实际不生效。
              group: [
                '@/plugins/host/**',
                '@/plugins/store/**',
                '@/plugins/ui/**',
                '@/plugins/manager',
                '@/plugins/search',
                '@/plugins/source',
                '@/plugins/candidate',
                '@/plugins/protocol',
              ],
              message:
                '插件实现只能被 src/plugins 内部引用。外部只能用 @/plugins 门面与 @/plugins/screens/* 屏幕模块。',
            },
            {
              group: [
                'axios',
                'cheerio',
                'cheerio/*',
                'crypto-js',
                'dayjs',
                'big-integer',
                'qs',
                'he',
              ],
              message:
                '这些依赖只为插件服务，必须随插件模块一并从 iOS 产物中裁剪，不得被平台中立代码引用。',
            },
          ],
        },
      ],
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
