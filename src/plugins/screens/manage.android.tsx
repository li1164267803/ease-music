// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { useRouter } from 'expo-router';
import { ChevronLeft, Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';

import type { InstallOutcome, PluginSummary } from '@/plugins/api';
import {
  installFromFile,
  installFromUrl,
  listPlugins,
  uninstallPlugin,
  updatePlugin,
} from '@/plugins/manager';
import { readRiskAcknowledged, writeRiskAcknowledged } from '@/plugins/store/storage';
import { RiskNotice } from '@/plugins/ui/risk-notice';
import { UserVariablesSheet } from '@/plugins/ui/user-variables-sheet';
import { Screen } from '@/ui/screen';
import { Sheet, SheetAction } from '@/ui/sheet';
import { AppText } from '@/ui/text';
import { Colors, Font, IconSize, MINI_DOCK_HEIGHT } from '@/ui/theme';

type PendingConfirmation = Extract<InstallOutcome, { kind: 'needs-confirmation' }>;

/**
 * 插件管理。
 *
 * 界面上没有任何具体插件的名称、地址或市场入口——plugin-source spec 的硬性要求，
 * 也是本产品定位的根基：从哪里获得插件完全由用户决定。
 */
export default function PluginManageScreen() {
  const router = useRouter();

  const [plugins, setPlugins] = useState<PluginSummary[]>(listPlugins);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [riskAcknowledged, setRiskAcknowledged] = useState(true);
  const [riskVisible, setRiskVisible] = useState(false);
  const [pendingInstall, setPendingInstall] = useState<(() => void) | null>(null);

  const [urlVisible, setUrlVisible] = useState(false);
  const [url, setUrl] = useState('');
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [variablesFor, setVariablesFor] = useState<PluginSummary | null>(null);

  useEffect(() => {
    void readRiskAcknowledged().then(setRiskAcknowledged);
  }, []);

  /** 首次安装前必须先过一次风险告知。已确认过的用户不再拦截。 */
  const guarded = (action: () => void) => {
    if (riskAcknowledged) {
      action();
      return;
    }
    setPendingInstall(() => action);
    setRiskVisible(true);
  };

  const acknowledge = () => {
    void writeRiskAcknowledged();
    setRiskAcknowledged(true);
    setRiskVisible(false);
    pendingInstall?.();
    setPendingInstall(null);
  };

  const run = async (task: () => Promise<InstallOutcome>) => {
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await task();
      if (outcome.kind === 'needs-confirmation') {
        setConfirmation(outcome);
        return;
      }
      setMessage(
        outcome.kind === 'installed'
          ? `已${outcome.replaced ? '更新' : '安装'}「${outcome.platform}」。`
          : outcome.reason,
      );
    } finally {
      setPlugins(listPlugins());
      setBusy(false);
    }
  };

  const confirmDowngrade = async () => {
    const pending = confirmation;
    if (!pending) return;
    setConfirmation(null);
    await run(pending.confirm);
  };

  const remove = async (platform: string) => {
    await uninstallPlugin(platform);
    setPlugins(listPlugins());
    setMessage(`已卸载「${platform}」。该插件加入的曲目仍保留在曲库中。`);
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ChevronLeft size={IconSize.lg} color={Colors.text} />
        </Pressable>
        <AppText size={24} weight="bold" letterSpacing={-0.5} style={{ flex: 1 }}>
          插件音源
        </AppText>
        <Pressable onPress={() => router.push('/plugin-search')} hitSlop={10}>
          <Search size={IconSize.md} color={Colors.text} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 14, paddingBottom: MINI_DOCK_HEIGHT }}
      >
        {plugins.length === 0 ? (
          <AppText size={12} color={Colors.textMuted} lineHeight={19}>
            还没有安装任何插件。本应用不提供、不内置、也不推荐任何插件，
            你需要自行获取插件文件或它的地址。
          </AppText>
        ) : (
          plugins.map((plugin) => (
            <PluginCard
              key={plugin.platform}
              plugin={plugin}
              onUpdate={() => guarded(() => void run(() => updatePlugin(plugin.platform)))}
              onVariables={() => setVariablesFor(plugin)}
              onRemove={() => void remove(plugin.platform)}
            />
          ))
        )}

        <View style={{ gap: 10, marginTop: 4 }}>
          <SheetAction
            label="从文件安装"
            hint="选择设备上的插件文件"
            onPress={() => guarded(() => void run(installFromFile))}
          />
          <SheetAction
            label="从地址安装"
            hint="输入你已知的插件地址"
            onPress={() => guarded(() => setUrlVisible(true))}
          />
        </View>

        {busy ? <ActivityIndicator color={Colors.accent} /> : null}
        {message ? (
          <AppText size={12} color={Colors.textMuted} lineHeight={19}>
            {message}
          </AppText>
        ) : null}
      </ScrollView>

      <RiskNotice
        visible={riskVisible}
        onAcknowledge={acknowledge}
        onClose={() => {
          setRiskVisible(false);
          setPendingInstall(null);
        }}
      />

      <Sheet visible={urlVisible} title="从地址安装" onClose={() => setUrlVisible(false)}>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="https://"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          style={{
            height: 47,
            borderRadius: 15,
            paddingHorizontal: 15,
            backgroundColor: Colors.surface2,
            color: Colors.text,
            fontFamily: Font.regular,
            fontSize: 13,
          }}
        />
        <SheetAction
          label="安装"
          onPress={() => {
            setUrlVisible(false);
            void run(() => installFromUrl(url));
          }}
        />
      </Sheet>

      <Sheet visible={confirmation !== null} title="版本确认" onClose={() => setConfirmation(null)}>
        <AppText size={13} lineHeight={21}>
          已安装「{confirmation?.platform}」的版本为 {confirmation?.installedVersion ?? '未知'}，
          即将安装的版本为 {confirmation?.incomingVersion ?? '未知'}，不是更高的版本。
        </AppText>
        <SheetAction label="仍然替换" danger onPress={() => void confirmDowngrade()} />
      </Sheet>

      <UserVariablesSheet plugin={variablesFor} onClose={() => setVariablesFor(null)} />
    </Screen>
  );
}

function PluginCard({
  plugin,
  onUpdate,
  onVariables,
  onRemove,
}: {
  plugin: PluginSummary;
  onUpdate: () => void;
  onVariables: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={{ backgroundColor: Colors.surface, borderRadius: 18, padding: 18, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AppText size={14} weight="semibold" style={{ flex: 1 }}>
          {plugin.platform}
        </AppText>
        <AppText size={11} color={Colors.textMuted}>
          {plugin.version ?? '未标版本'}
        </AppText>
      </View>

      <AppText size={11} color={Colors.textMuted}>
        {describeCapabilities(plugin)}
        {plugin.author ? ` · ${plugin.author}` : ''}
        {plugin.cacheControl ? ` · 地址缓存声明：${plugin.cacheControl}` : ''}
      </AppText>

      {plugin.loadError ? (
        <AppText size={11} color={Colors.danger} lineHeight={17}>
          {plugin.loadError}
        </AppText>
      ) : null}
      {plugin.compat === 'not-satisfied' ? (
        <AppText size={11} color={Colors.danger} lineHeight={17}>
          该插件声明的适配版本与当前应用不一致，可能无法正常工作。
        </AppText>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 18, marginTop: 4 }}>
        <CardAction label="设置" onPress={onVariables} />
        {plugin.srcUrl ? <CardAction label="更新" onPress={onUpdate} /> : null}
        <CardAction label="卸载" danger onPress={onRemove} />
      </View>
    </View>
  );
}

function CardAction({
  label,
  danger = false,
  onPress,
}: {
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <AppText size={12} weight="medium" color={danger ? Colors.danger : Colors.accent}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * 协议方法全部可选，插件没实现的能力如实说明即可——spec 要求「未实现的方法在界面上
 * 不可用，MUST NOT 表现为错误」，因此这里是陈述而不是警告。
 */
const SEARCH_TYPE_LABELS: Record<string, string> = {
  music: '歌曲',
  album: '专辑',
  artist: '艺人',
  sheet: '歌单',
  lyric: '歌词',
};

function describeCapabilities(plugin: PluginSummary): string {
  const abilities: string[] = [];
  if (plugin.canSearchMusic) abilities.push('搜索');
  if (plugin.canResolveMedia) abilities.push('播放');
  if (abilities.length > 0) return abilities.join(' · ');

  // 有搜索能力但搜的不是歌（如歌词类插件）。如实说清楚它能搜什么、为什么用不上，
  // 好过笼统地说「未提供搜索能力」——那会让用户以为插件坏了。
  const types = plugin.declaredSearchTypes;
  if (types && types.length > 0) {
    const labels = types.map((type) => SEARCH_TYPE_LABELS[type] ?? type).join('、');
    return `只支持搜索${labels}，当前版本用不到`;
  }
  return '未提供搜索与播放能力';
}
