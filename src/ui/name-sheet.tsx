// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useState } from 'react';
import { Pressable, TextInput } from 'react-native';

import { Sheet } from '@/ui/sheet';
import { AppText } from '@/ui/text';
import { Colors, Font } from '@/ui/theme';

type NameSheetProps = {
  visible: boolean;
  title: string;
  confirmLabel: string;
  initialValue?: string;
  onClose: () => void;
  /** 返回错误文案表示校验未通过、弹层不关闭；返回 null 表示成功。 */
  onSubmit: (name: string) => Promise<string | null>;
};

/** 新建与重命名歌单共用的输入弹层。 */
export function NameSheet({ visible, title, initialValue = '', onClose, ...rest }: NameSheetProps) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      {/*
        用 key 让表单在「打开」或「初值变化」时整体重新挂载，从而拿到新的初值。
        重命名的初值来自异步查询，弹层打开那一刻才到位——用 effect 去同步会在
        每次渲染后再触发一轮渲染，React 官方对这类「按 prop 重置 state」的建议
        就是换 key 重新挂载。
      */}
      <NameForm
        key={`${String(visible)}:${initialValue}`}
        initialValue={initialValue}
        onClose={onClose}
        {...rest}
      />
    </Sheet>
  );
}

type NameFormProps = Pick<NameSheetProps, 'confirmLabel' | 'onClose' | 'onSubmit'> & {
  initialValue: string;
};

function NameForm({ confirmLabel, initialValue, onClose, onSubmit }: NameFormProps) {
  const [name, setName] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <TextInput
        value={name}
        onChangeText={(text) => {
          setName(text);
          setError(null);
        }}
        placeholder="歌单名称"
        placeholderTextColor={Colors.textMuted}
        autoFocus
        style={{
          height: 47,
          borderRadius: 15,
          paddingHorizontal: 15,
          backgroundColor: Colors.surface2,
          color: Colors.text,
          fontFamily: Font.regular,
          fontSize: 14,
          borderWidth: 1,
          borderColor: error ? Colors.danger : 'transparent',
        }}
      />
      {error ? (
        <AppText size={12} color="#FF6B6B">
          {error}
        </AppText>
      ) : null}
      <Pressable
        onPress={() => {
          void onSubmit(name).then((message) => {
            if (message) setError(message);
            else onClose();
          });
        }}
        style={{
          height: 46,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: Colors.accent,
        }}
      >
        <AppText size={14} weight="semibold" color={Colors.bg}>
          {confirmLabel}
        </AppText>
      </Pressable>
    </>
  );
}
