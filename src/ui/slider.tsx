// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { Colors } from '@/ui/theme';

type SliderProps = {
  value: number;
  max: number;
  /** 拖动过程中持续回调，用于让界面即时跟手 */
  onScrub: (value: number) => void;
  /** 松手时回调，此时才真正 seek */
  onCommit: (value: number) => void;
};

/**
 * 进度条。设计稿的轨道高 4、圆角 2，已播放部分为 accent 色。
 *
 * 自己实现而不是引第三方 slider：需要的交互只有「按下即跳、拖动跟手、松手落定」，
 * 用一个 Pan 手势就能表达，引入一个库反而要为它的样式定制绕路。
 */
export function Slider({ value, max, onScrub, onCommit }: SliderProps) {
  const [width, setWidth] = useState(0);

  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;

  /**
   * 换算与回调都留在 JS 线程。
   *
   * 手势回调会被编译成 worklet 跑在 UI 线程，在那里同步调用这类普通闭包会直接抛
   * 「Tried to synchronously call a Remote Function」；而且换算要读 `width` 这个
   * React state，它本来就只存在于 JS 线程。因此 UI 线程只负责把原始 x 交回来。
   */
  const scrubAt = (x: number) => onScrub(toValue(x));
  const commitAt = (x: number) => onCommit(toValue(x));

  const toValue = (x: number) => {
    if (width <= 0 || max <= 0) return 0;
    return Math.round(Math.min(Math.max(x / width, 0), 1) * max);
  };

  const gesture = Gesture.Pan()
    // 允许原地按下就开始，用户点轨道任意位置即可跳转
    .minDistance(0)
    .onBegin((event) => scheduleOnRN(scrubAt, event.x))
    .onUpdate((event) => scheduleOnRN(scrubAt, event.x))
    // 只用 onFinalize 落定：它在正常结束与被打断时都会触发，而 onEnd 只覆盖前者。
    // 两个都接会让一次拖动 seek 两遍。
    .onFinalize((event) => scheduleOnRN(commitAt, event.x));

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <GestureDetector gesture={gesture}>
      {/* 轨道只有 4pt 高，外面套一层透明区域把可点区扩到 24pt */}
      <View style={{ paddingVertical: 10, justifyContent: 'center' }} onLayout={onLayout}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: Colors.line }}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: Colors.accent,
              width: `${ratio * 100}%`,
            }}
          />
        </View>
      </View>
    </GestureDetector>
  );
}
