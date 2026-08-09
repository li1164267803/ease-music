// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/ui/text';
import { Colors, SCREEN_PADDING } from '@/ui/theme';

type SheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/** 底部弹层。沿用设计稿卡片的 surface 底色与 18 圆角。 */
export function Sheet({ visible, title, onClose, children }: SheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#000000A6' }} onPress={onClose} />
      <View
        style={{
          backgroundColor: Colors.surface,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          paddingTop: 18,
          paddingHorizontal: SCREEN_PADDING,
          paddingBottom: 18 + insets.bottom,
          gap: 14,
        }}
      >
        <AppText size={17} weight="bold">
          {title}
        </AppText>
        {children}
      </View>
    </Modal>
  );
}

type SheetActionProps = {
  label: string;
  hint?: string;
  danger?: boolean;
  onPress: () => void;
};

export function SheetAction({ label, hint, danger = false, onPress }: SheetActionProps) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 13,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: Colors.surface2,
        gap: 3,
      }}
    >
      <AppText size={14} weight="medium" color={danger ? Colors.danger : Colors.text}>
        {label}
      </AppText>
      {hint ? (
        <AppText size={11} color={Colors.textMuted}>
          {hint}
        </AppText>
      ) : null}
    </Pressable>
  );
}
