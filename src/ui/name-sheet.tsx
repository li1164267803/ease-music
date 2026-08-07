// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 琥珀音乐 AmberMusic

import { useEffect, useState } from 'react';
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
export function NameSheet({
  visible,
  title,
  confirmLabel,
  initialValue = '',
  onClose,
  onSubmit,
}: NameSheetProps) {
  const [name, setName] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  // 重命名时初值来自异步查询，弹层打开的那一刻才拿得到，因此要同步进来，
  // 否则输入框会停在上一次的内容上。
  useEffect(() => {
    if (visible) {
      setName(initialValue);
      setError(null);
    }
  }, [visible, initialValue]);

  const close = () => {
    setError(null);
    onClose();
  };

  return (
    <Sheet visible={visible} title={title} onClose={close}>
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
          borderColor: error ? '#FF6B6B' : 'transparent',
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
            else close();
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
    </Sheet>
  );
}
