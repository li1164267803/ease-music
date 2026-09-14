// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { FlashList } from '@shopify/flash-list';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { candidateKey, type CandidateTrack } from '@/domain/model/candidate-track';
import { importItem, importSheet, type ImportOutcome } from '@/plugins/discovery';
import type { LoadedPlugin } from '@/plugins/host/loader';
import { importingPlugins } from '@/plugins/manager';
import { CandidateRow } from '@/ui/candidate-row';
import { ImportToPlaylistSheet, type CandidateLoader } from '@/ui/import-to-playlist-sheet';
import { ScreenHeader } from '@/plugins/ui/screen-header';
import { useCandidateAdd } from '@/plugins/ui/use-candidate-add';
import { Chip } from '@/ui/chip';
import { Screen } from '@/ui/screen';
import { SheetAction } from '@/ui/sheet';
import { AppText } from '@/ui/text';
import { Colors, Font } from '@/ui/theme';
import { useMiniDockInset } from '@/ui/mini-player';

type ImportMode = 'sheet' | 'item';

const MODE_LABELS: Record<ImportMode, string> = { sheet: '歌单', item: '单曲' };

type Result =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'unrecognized'; platform: string }
  | { status: 'failed'; reason: string }
  | { status: 'done'; items: CandidateTrack[] };

const IDLE: Result = { status: 'idle' };

/**
 * 链接导入页（add-plugin-discovery-import/design.md 决策 5）：用户先选插件、再选歌单或单曲，
 * 粘贴链接后由该插件解析。不跨插件猜测链接归属——两个样本插件都接受纯数字 ID，
 * 同一串数字无法判断属于谁。
 *
 * 解析结果是候选曲目：不加入就不会碰曲库。歌单模式的列表可整个加入歌单。
 */
export default function PluginDiscoveryImportScreen() {
  const plugins = importingPlugins();
  const [platform, setPlatform] = useState<string | null>(null);
  const plugin = plugins.find((entry) => entry.meta.platform === platform) ?? plugins[0] ?? null;

  return (
    <Screen>
      <ScreenHeader title="链接导入" />
      {plugin ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {plugins.map((entry) => (
              <Chip
                key={entry.meta.platform}
                label={entry.meta.platform}
                active={entry === plugin}
                onPress={() => setPlatform(entry.meta.platform)}
              />
            ))}
          </View>
          {/* 换插件即换一次表单：模式、输入与结果都是针对某个插件的 */}
          <ImportForm key={plugin.meta.platform} plugin={plugin} />
        </>
      ) : (
        <AppText size={12} color={Colors.textMuted} lineHeight={19}>
          当前没有支持导入的插件。
        </AppText>
      )}
    </Screen>
  );
}

function ImportForm({ plugin }: { plugin: LoadedPlugin }) {
  const dockInset = useMiniDockInset();
  const { meta } = plugin;
  const modes: ImportMode[] = [
    ...(meta.canImportSheet ? (['sheet'] as const) : []),
    ...(meta.canImportItem ? (['item'] as const) : []),
  ];

  const [mode, setMode] = useState<ImportMode>(modes[0] ?? 'sheet');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<Result>(IDLE);
  const { added, notice, add, clearNotice } = useCandidateAdd();
  const [importing, setImporting] = useState(false);

  const hints = mode === 'sheet' ? meta.importHints.sheet : meta.importHints.item;
  const items = result.status === 'done' ? result.items : [];
  // 列表已经解析好，弹层直接拿；依赖写 result 而不是 items，后者每次渲染都是新数组
  const collect = useCallback<CandidateLoader>(
    () =>
      Promise.resolve({ items: result.status === 'done' ? result.items : [], truncated: false }),
    [result],
  );

  const resolve = async () => {
    const urlLike = input.trim();
    if (!urlLike || result.status === 'busy') return;
    setResult({ status: 'busy' });
    clearNotice();
    try {
      const outcome: ImportOutcome =
        mode === 'sheet' ? await importSheet(plugin, urlLike) : await importItem(plugin, urlLike);
      setResult(
        outcome.recognized
          ? { status: 'done', items: outcome.items }
          : { status: 'unrecognized', platform: meta.platform },
      );
    } catch (error) {
      setResult({
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const canResolve = input.trim().length > 0 && result.status !== 'busy';

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {modes.map((candidate) => (
          <Chip
            key={candidate}
            label={MODE_LABELS[candidate]}
            active={candidate === mode}
            onPress={() => {
              setMode(candidate);
              setResult(IDLE);
            }}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={`粘贴${MODE_LABELS[mode]}的分享链接或 ID`}
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => void resolve()}
          returnKeyType="go"
          style={{
            flex: 1,
            height: 47,
            borderRadius: 15,
            paddingHorizontal: 15,
            backgroundColor: Colors.surface,
            color: Colors.text,
            fontFamily: Font.regular,
            fontSize: 13,
          }}
        />
        <Pressable
          onPress={() => void resolve()}
          disabled={!canResolve}
          style={{
            height: 47,
            paddingHorizontal: 22,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: canResolve ? Colors.accent : Colors.surface,
          }}
        >
          <AppText size={14} weight="semibold" color={canResolve ? Colors.bg : Colors.textMuted}>
            解析
          </AppText>
        </Pressable>
      </View>

      {/* 插件自述的粘贴说明：链接格式完全由插件决定，这是用户唯一能看到的「该粘什么」 */}
      {hints.length > 0 ? (
        <View style={{ gap: 4 }}>
          {hints.map((hint) => (
            <AppText key={hint} size={11} color={Colors.textMuted} lineHeight={17}>
              · {hint}
            </AppText>
          ))}
        </View>
      ) : null}

      {mode === 'sheet' && items.length > 0 ? (
        <SheetAction
          label="全部加入歌单"
          hint={`${items.length} 首，一并入库并放进歌单`}
          onPress={() => setImporting(true)}
        />
      ) : null}
      <ImportToPlaylistSheet
        visible={importing}
        load={collect}
        defaultName=""
        onClose={() => setImporting(false)}
      />

      {notice ? (
        <AppText size={12} color={Colors.textMuted} lineHeight={19}>
          {notice}
        </AppText>
      ) : null}

      <FlashList
        data={items}
        keyExtractor={candidateKey}
        contentContainerStyle={{ paddingBottom: dockInset }}
        ItemSeparatorComponent={() => <View style={{ height: 15 }} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Status result={result} />}
        renderItem={({ item: candidate }) => (
          <CandidateRow
            candidate={candidate}
            added={added.has(candidateKey(candidate))}
            onAdd={() => void add(candidate)}
          />
        )}
      />
    </>
  );
}

/** 列表为空时的说明：三种回答分开说清（design.md 决策 6）。 */
function Status({ result }: { result: Result }) {
  switch (result.status) {
    case 'idle':
      return null;
    case 'busy':
      return <ActivityIndicator color={Colors.accent} style={{ alignSelf: 'flex-start' }} />;
    case 'unrecognized':
      return (
        <AppText size={12} color={Colors.textMuted} lineHeight={19}>
          插件「{result.platform}」无法识别这个链接，请核对上面的粘贴说明。
        </AppText>
      );
    case 'failed':
      return (
        <AppText size={11} color={Colors.danger} lineHeight={17}>
          {result.reason}
        </AppText>
      );
    case 'done':
      return (
        <AppText size={12} color={Colors.textMuted}>
          没有取到任何曲目。
        </AppText>
      );
  }
}
