// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import type { PluginSummary } from '@/plugins/api';
import { getUserVariables, saveUserVariables } from '@/plugins/manager';
import { Sheet } from '@/ui/sheet';
import { AppText } from '@/ui/text';
import { Colors, Font } from '@/ui/theme';

type UserVariablesSheetProps = {
  /** 为 null 时不显示。非 null 即为要编辑的插件。 */
  plugin: PluginSummary | null;
  onClose: () => void;
};

/**
 * 插件用户变量的查看与填写（plugin-source spec「插件用户变量」）。
 *
 * 多数插件要靠用户自备的 cookie 或 token 才能工作，值往往很长，因此插件声明为
 * textarea 的变量给多行输入框。值按插件名持久保存，插件更新后不受影响。
 */
export function UserVariablesSheet({ plugin, onClose }: UserVariablesSheetProps) {
  // key 让插件切换时整棵子树重建，否则上一个插件的输入值会留在输入框里
  return plugin ? <Editor key={plugin.platform} plugin={plugin} onClose={onClose} /> : null;
}

function Editor({ plugin, onClose }: { plugin: PluginSummary; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    getUserVariables(plugin.platform),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveUserVariables(plugin.platform, values);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible title={`${plugin.platform} 的设置`} onClose={onClose}>
      {plugin.userVariables.length === 0 ? (
        <AppText size={12} color={Colors.textMuted}>
          这个插件没有需要填写的变量。
        </AppText>
      ) : (
        plugin.userVariables.map((variable) => (
          <View key={variable.key} style={{ gap: 6 }}>
            <AppText size={12} weight="medium">
              {variable.name ?? variable.key}
            </AppText>
            {variable.hint ? (
              <AppText size={11} color={Colors.textMuted}>
                {variable.hint}
              </AppText>
            ) : null}
            <TextInput
              value={values[variable.key] ?? ''}
              onChangeText={(text) => setValues({ ...values, [variable.key]: text })}
              multiline={variable.field === 'textarea'}
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                minHeight: variable.field === 'textarea' ? 88 : 47,
                borderRadius: 15,
                paddingHorizontal: 15,
                paddingVertical: 13,
                textAlignVertical: variable.field === 'textarea' ? 'top' : 'center',
                backgroundColor: Colors.surface2,
                color: Colors.text,
                fontFamily: Font.regular,
                fontSize: 13,
              }}
            />
          </View>
        ))
      )}

      <Pressable
        onPress={() => void save()}
        disabled={saving}
        style={{
          borderRadius: 15,
          paddingVertical: 14,
          alignItems: 'center',
          backgroundColor: Colors.accent,
        }}
      >
        <AppText size={14} weight="semibold" color={Colors.bg}>
          保存
        </AppText>
      </Pressable>
    </Sheet>
  );
}
