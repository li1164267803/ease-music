// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';

import { importCandidates, type ImportCandidatesResult, type ImportTarget } from '@/library/import';
import { notifyLibraryChanged, usePlaylists } from '@/library/store';
import type { CollectedTracks } from '@/plugins/discovery';
import { Sheet, SheetAction } from '@/ui/sheet';
import { AppText } from '@/ui/text';
import { Colors, Font } from '@/ui/theme';

/** 候选曲目的获取方式。取页有进度就报页码；已解析好的列表直接返回。 */
export type CandidateLoader = (onProgress: (page: number) => void) => Promise<CollectedTracks>;

type ImportToPlaylistSheetProps = {
  visible: boolean;
  load: CandidateLoader;
  /** 新建歌单的默认名：来源列表的标题；链接导入没有标题，传空串由用户填写。 */
  defaultName: string;
  onClose: () => void;
};

/**
 * 「全部加入歌单」的目标弹层（add-plugin-discovery-import/design.md 决策 4）：
 * 取曲目 → 选目标（新建或既有歌单）→ 入库 → 结果，三段状态都在弹层内部。
 * 候选曲目页与链接导入页共用，两者只是 `load` 不同。
 */
export function ImportToPlaylistSheet({
  visible,
  load,
  defaultName,
  onClose,
}: ImportToPlaylistSheetProps) {
  return (
    <Sheet visible={visible} title="加入歌单" onClose={onClose}>
      {/* 关闭时卸载流程：每次打开都从取曲目开始，不复用上次的列表（spec 要求实时获取） */}
      {visible ? <ImportFlow load={load} defaultName={defaultName} onClose={onClose} /> : null}
    </Sheet>
  );
}

type Phase =
  | { status: 'collecting'; page: number }
  | { status: 'collect-failed'; reason: string }
  | { status: 'choosing'; collected: CollectedTracks }
  | { status: 'importing' }
  | { status: 'done'; collected: CollectedTracks; result: ImportSuccess };

type ImportSuccess = Extract<ImportCandidatesResult, { ok: true }>;

function ImportFlow({ load, defaultName, onClose }: Omit<ImportToPlaylistSheetProps, 'visible'>) {
  const [phase, setPhase] = useState<Phase>({ status: 'collecting', page: 1 });
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    load((page) => {
      if (active) setPhase({ status: 'collecting', page });
    }).then(
      (collected) => {
        if (active) setPhase({ status: 'choosing', collected });
      },
      (reason: unknown) => {
        if (active) setPhase({ status: 'collect-failed', reason: describe(reason) });
      },
    );
    return () => {
      active = false;
    };
  }, [load, attempt]);

  const importTo = async (collected: CollectedTracks, target: ImportTarget) => {
    setPhase({ status: 'importing' });
    const result = await importCandidates(collected.items, target);
    if (!result.ok) {
      // 目标不成立（名称为空）时什么都没发生，回到选目标让用户改
      setError(result.reason);
      setPhase({ status: 'choosing', collected });
      return;
    }
    notifyLibraryChanged();
    setPhase({ status: 'done', collected, result });
  };

  switch (phase.status) {
    case 'collecting':
      return (
        <Progress>{phase.page > 1 ? `正在获取第 ${phase.page} 页…` : '正在获取整个列表…'}</Progress>
      );
    case 'importing':
      return <Progress>正在加入曲库…</Progress>;
    case 'collect-failed':
      return (
        <>
          <AppText size={12} color={Colors.danger} lineHeight={19}>
            {phase.reason}
          </AppText>
          <SheetAction label="重试" onPress={() => setAttempt((count) => count + 1)} />
        </>
      );
    case 'done':
      return <Outcome collected={phase.collected} result={phase.result} onClose={onClose} />;
    case 'choosing':
      return (
        <>
          <AppText size={12} color={Colors.textMuted} lineHeight={19}>
            共 {phase.collected.items.length} 首
            {phase.collected.truncated ? '（列表过长，只取了这些）' : ''}
          </AppText>

          <View style={{ gap: 8 }}>
            <TextInput
              value={name}
              onChangeText={(text) => {
                setName(text);
                setError(null);
              }}
              placeholder="新歌单名称"
              placeholderTextColor={Colors.textMuted}
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
              <AppText size={12} color={Colors.danger}>
                {error}
              </AppText>
            ) : null}
            <Pressable
              onPress={() => void importTo(phase.collected, { kind: 'new', name })}
              style={{
                height: 46,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: Colors.accent,
              }}
            >
              <AppText size={14} weight="semibold" color={Colors.bg}>
                新建歌单并加入
              </AppText>
            </Pressable>
          </View>

          <ExistingPlaylists
            onPick={(playlistId) =>
              void importTo(phase.collected, { kind: 'existing', playlistId })
            }
          />
        </>
      );
  }
}

function Progress({ children }: { children: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <ActivityIndicator color={Colors.accent} />
      <AppText size={12} color={Colors.textMuted}>
        {children}
      </AppText>
    </View>
  );
}

/** 既有歌单列表。版式与曲目操作弹层里的「加入歌单」一致。 */
function ExistingPlaylists({ onPick }: { onPick: (playlistId: string) => void }) {
  const playlists = usePlaylists();
  if (playlists.length === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      <AppText size={11} color={Colors.textMuted}>
        或追加到既有歌单
      </AppText>
      <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ gap: 8 }}>
        {playlists.map((playlist) => (
          <Pressable
            key={playlist.id}
            onPress={() => onPick(playlist.id)}
            style={{
              paddingVertical: 13,
              paddingHorizontal: 14,
              borderRadius: 14,
              backgroundColor: Colors.surface2,
              gap: 3,
            }}
          >
            <AppText size={14} weight="medium">
              {playlist.name}
            </AppText>
            <AppText size={11} color={Colors.textMuted}>
              {playlist.trackCount} 首
            </AppText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function Outcome({
  collected,
  result,
  onClose,
}: {
  collected: CollectedTracks;
  result: ImportSuccess;
  onClose: () => void;
}) {
  const router = useRouter();
  const parts = [`新增入库 ${result.added} 首`];
  if (result.duplicates > 0) parts.push(`${result.duplicates} 首原已在曲库`);
  const skipped = collected.items.length - result.addedToPlaylist;
  if (skipped > 0) parts.push(`${skipped} 首本就在该歌单中`);
  if (collected.truncated) parts.push(`列表过长，只导入了前 ${collected.items.length} 首`);

  return (
    <>
      <AppText size={12} color={Colors.textMuted} lineHeight={19}>
        已加入歌单「{result.playlist.name}」：{parts.join('，')}。
      </AppText>
      <SheetAction
        label="查看歌单"
        onPress={() => {
          onClose();
          router.push(`/playlist/${result.playlist.id}`);
        }}
      />
      <SheetAction label="完成" onPress={onClose} />
    </>
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
