// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useEffect, useState } from 'react';

import type { DiscoveryPage } from '@/plugins/discovery';

/**
 * 面向**单个插件**的分页列表（add-plugin-discovery-charts/design.md 决策 5）：
 * 进入即取第一页，到底或失败后不再请求。
 *
 * 与搜索页不同，这里没有跨插件的 `continuing` 游标——一个榜单、一个标签、一个歌单
 * 天然只属于一个插件，`isEnd` 就是全部。
 *
 * `load` 必须是稳定引用（调用方用 `useCallback` 绑定插件与条目）：它就是列表的身份，
 * 变了即视为另一个列表。
 */
export function usePagedList<T>(load: (page: number) => Promise<DiscoveryPage<T>>) {
  const [items, setItems] = useState<T[]>([]);
  /** 请求到的页码。 */
  const [page, setPage] = useState(1);
  /** 已有结果（成功或失败）的页码。落后于 `page` 就是请求进行中。 */
  const [settled, setSettled] = useState(0);
  const [isEnd, setIsEnd] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    load(page).then(
      (result) => {
        setItems((previous) => (page === 1 ? result.items : [...previous, ...result.items]));
        setIsEnd(result.isEnd);
        setSettled(page);
      },
      (error: unknown) => {
        setFailure(error instanceof Error ? error.message : String(error));
        setSettled(page);
      },
    );
  }, [load, page]);

  const busy = settled < page;

  return {
    items,
    busy,
    failure,
    /** 翻下一页。进行中、已到底或已失败时不动作——失败后继续翻页只会重复同一个错误。 */
    loadMore: () => {
      if (!busy && !isEnd && failure === null) setPage(page + 1);
    },
  };
}
