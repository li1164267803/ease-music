// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import type { CollectedTracks } from '@/domain/model/candidate-track';
import {
  importLocalFiles,
  importRemoteUrl,
  preparePlaylistFromFile,
  preparePlaylistFromUrl,
  type PreparedPlaylist,
} from '@/library/import';
import { notifyLibraryChanged } from '@/library/store';
import { keepsCopyOfPickedFiles } from '@/sources/local-file';
import { ImportToPlaylistSheet, type CandidateLoader } from '@/ui/import-to-playlist-sheet';
import { Sheet, SheetAction } from '@/ui/sheet';
import { AppText } from '@/ui/text';
import { Colors, Font } from '@/ui/theme';

type ImportSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** 解析完成、等待用户选歌单的播放列表。 */
type ReadyPlaylist = { collected: CollectedTracks; defaultName: string };

export function ImportSheet({ visible, onClose }: ImportSheetProps) {
  // 「添加一首」与「导入一批」是两件事，各自占满整个弹层而不是挤在一屏里：
  // 前者要一个地址，后者要一个播放列表，混排只会让两个输入框互相干扰。
  const [mode, setMode] = useState<'add' | 'playlist'>('add');
  const [ready, setReady] = useState<ReadyPlaylist | null>(null);

  const close = () => {
    setMode('add');
    setReady(null);
    onClose();
  };

  // 取回与解析已经在打开这个弹层之前完成，这里只是把现成的列表交出去。
  // 用 useMemo 固定住函数身份——弹层拿它当 effect 依赖，每次渲染换一个新函数会让它反复重取。
  const load = useMemo<CandidateLoader | null>(
    () => (ready ? () => Promise.resolve(ready.collected) : null),
    [ready],
  );

  return (
    <>
      <Sheet
        visible={visible && ready === null}
        title={mode === 'add' ? '添加音乐' : '导入播放列表'}
        onClose={close}
      >
        {mode === 'add' ? (
          <AddPanel onPlaylist={() => setMode('playlist')} />
        ) : (
          <PlaylistPanel onReady={setReady} onBack={() => setMode('add')} />
        )}
      </Sheet>

      {ready && load ? (
        <ImportToPlaylistSheet
          visible
          load={load}
          defaultName={ready.defaultName}
          onClose={close}
        />
      ) : null}
    </>
  );
}

function AddPanel({ onPlaylist }: { onPlaylist: () => void }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

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
    <>
      <SheetAction
        label="从设备选择音频文件"
        hint={
          keepsCopyOfPickedFiles
            ? '可多选。应用内会另存一份，原文件不受影响。'
            : '可多选。原文件留在原处，曲库只记录它的位置。'
        }
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

      <SheetAction
        label="导入播放列表"
        hint="m3u / m3u8 文件里的地址一次变成一个歌单。"
        onPress={onPlaylist}
      />

      {busy ? <ActivityIndicator color={Colors.accent} /> : null}
      {message ? (
        <AppText size={12} color={invalid ? Colors.danger : Colors.textMuted}>
          {message}
        </AppText>
      ) : null}
    </>
  );
}

function PlaylistPanel({
  onReady,
  onBack,
}: {
  onReady: (ready: ReadyPlaylist) => void;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  // 记下失败来自哪个入口：只有地址导入失败才该把地址输入框标红，
  // 选中的文件不是播放列表时标红它，看上去像是地址填错了。
  const [failure, setFailure] = useState<{ reason: string; fromUrl: boolean } | null>(null);

  const prepare = async (run: () => Promise<PreparedPlaylist>, fromUrl: boolean) => {
    setBusy(true);
    setFailure(null);
    try {
      const prepared = await run();
      // 取消不是失败，不该在界面上留下一条红字。
      if (prepared.status === 'canceled') return;
      if (prepared.status === 'failed') {
        setFailure({ reason: prepared.reason, fromUrl });
        return;
      }
      onReady({ collected: prepared.collected, defaultName: prepared.defaultName });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppText size={12} color={Colors.textMuted} lineHeight={19}>
        导入是一次快照：生成的是一个普通歌单，此后不跟随播放列表文件的变化。
      </AppText>

      <SheetAction
        label="从设备选择播放列表文件"
        hint=".m3u / .m3u8"
        onPress={() => void prepare(preparePlaylistFromFile, false)}
      />

      <View style={{ gap: 8 }}>
        <AppText size={11} color={Colors.textMuted}>
          或粘贴一个播放列表地址
        </AppText>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={url}
            onChangeText={(text) => {
              setUrl(text);
              setFailure(null);
            }}
            placeholder="https://example.com/list.m3u"
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
              borderColor: failure?.fromUrl ? Colors.danger : 'transparent',
            }}
          />
          <Pressable
            onPress={() => void prepare(() => preparePlaylistFromUrl(url), true)}
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
              导入
            </AppText>
          </Pressable>
        </View>
      </View>

      {busy ? <ActivityIndicator color={Colors.accent} /> : null}
      {failure ? (
        <AppText size={12} color={Colors.danger} lineHeight={19}>
          {failure.reason}
        </AppText>
      ) : null}

      <SheetAction label="返回" onPress={onBack} />
    </>
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
