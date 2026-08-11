// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { Search, X } from 'lucide-react-native';
import { Pressable, TextInput, View } from 'react-native';

import { Colors, Font } from '@/ui/theme';

type SearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  /** 需要按回车才发起检索时传它。曲库检索是随输入即时过滤的，不需要。 */
  onSubmitEditing?: () => void;
};

/** 设计稿 Search Field：surface 底、圆角 15、内距 14/15、图标与文字间距 10。 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  onSubmitEditing,
}: SearchFieldProps) {
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
        // 搜索词不该被自动首字母大写，也不该被拼写纠正——曲名和艺人名经常不是规范英文单词
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={onSubmitEditing ? 'search' : undefined}
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
