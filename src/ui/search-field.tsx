// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { Search, X } from 'lucide-react-native';
import { Pressable, TextInput, View } from 'react-native';

import { Colors, Font } from '@/ui/theme';

type SearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
};

/** 设计稿 Search Field：surface 底、圆角 15、内距 14/15、图标与文字间距 10。 */
export function SearchField({ value, onChangeText, placeholder }: SearchFieldProps) {
  return (
    <View
      style={{
        borderRadius: 15,
        backgroundColor: Colors.surface,
        paddingVertical: 14,
        paddingHorizontal: 15,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Search size={17} color={Colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        style={{ flex: 1, padding: 0, color: Colors.text, fontFamily: Font.regular, fontSize: 13 }}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10}>
          <X size={16} color={Colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}
