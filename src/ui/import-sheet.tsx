// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { importLocalFiles, importRemoteUrl } from '@/library/import';
import { notifyLibraryChanged } from '@/library/store';
import { Sheet, SheetAction } from '@/ui/sheet';
import { AppText } from '@/ui/text';
import { Colors, Font } from '@/ui/theme';

type ImportSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function ImportSheet({ visible, onClose }: ImportSheetProps) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const close = () => {
    setUrl('');
    setMessage(null);
    setInvalid(false);
    onClose();
  };

  const pickFiles = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const summary = await importLocalFiles();
      notifyLibraryChanged();
      setMessage(describe(summary.added.length, summary.duplicates, summary.failures));
    } finally {
      setBusy(false);
    }
  };

  const addUrl = async () => {
    setBusy(true);
    try {
      const result = await importRemoteUrl(url);
      if (!result.ok) {
        setInvalid(true);
        setMessage(result.reason);
        return;
      }
      notifyLibraryChanged();
      setInvalid(false);
      setUrl('');
      setMessage(
        result.duplicate ? '这个地址已经在曲库中了。' : `已添加「${result.track.title}」。`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} title="添加音乐" onClose={close}>
      <SheetAction
        label="从设备选择音频文件"
        hint="可多选。原文件留在原处，曲库只记录它的位置。"
        onPress={() => void pickFiles()}
      />

      <View style={{ gap: 8 }}>
        <AppText size={11} color={Colors.textMuted}>
          或添加一个可直接访问的音频地址
        </AppText>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={url}
            onChangeText={(text) => {
              setUrl(text);
              setInvalid(false);
            }}
            placeholder="https://example.com/song.mp3"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="url"
            style={{
              flex: 1,
              height: 47,
              borderRadius: 15,
              paddingHorizontal: 15,
              backgroundColor: Colors.surface2,
              color: Colors.text,
              fontFamily: Font.regular,
              fontSize: 13,
              borderWidth: 1,
              borderColor: invalid ? Colors.danger : 'transparent',
            }}
          />
          <Pressable
            onPress={() => void addUrl()}
            disabled={busy || url.trim().length === 0}
            style={{
              height: 47,
              paddingHorizontal: 22,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: url.trim() ? Colors.accent : Colors.surface2,
            }}
          >
            <AppText size={14} weight="semibold" color={url.trim() ? Colors.bg : Colors.textMuted}>
              添加
            </AppText>
          </Pressable>
        </View>
      </View>

      {busy ? <ActivityIndicator color={Colors.accent} /> : null}
      {message ? (
        <AppText size={12} color={invalid ? Colors.danger : Colors.textMuted}>
          {message}
        </AppText>
      ) : null}
    </Sheet>
  );
}

function describe(
  added: number,
  duplicates: number,
  failures: { name: string; reason: string }[],
): string {
  const parts: string[] = [];
  if (added > 0) parts.push(`已加入 ${added} 首`);
  if (duplicates > 0) parts.push(`${duplicates} 首已在曲库中`);
  // 失败的逐个点名。批量导入里静默吞掉几首是最让人困惑的行为。
  if (failures.length > 0) {
    parts.push(
      `${failures.length} 首失败：${failures.map((f) => `${f.name}（${f.reason}）`).join('、')}`,
    );
  }
  return parts.length > 0 ? parts.join('，') + '。' : '没有选择任何文件。';
}
