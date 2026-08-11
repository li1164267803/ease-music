// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 li1164267803 · 自在音乐 EaseMusic

import { Pressable } from 'react-native';

import { INJECTED_MODULE_NAMES } from '@/plugins/host/deps';
import { Sheet } from '@/ui/sheet';
import { AppText } from '@/ui/text';
import { Colors } from '@/ui/theme';

type RiskNoticeProps = {
  visible: boolean;
  onAcknowledge: () => void;
  onClose: () => void;
};

/**
 * 首次安装插件前的风险告知（plugin-source spec）。
 *
 * 措辞刻意不出现「沙箱」「受限」「隔离」一类字眼——插件与应用代码在同一环境中执行，
 * 能力等同于应用自身代码，spec 明确要求 MUST NOT 以任何方式暗示插件受到隔离。
 * 唯一真实的限制是「只能用宿主提供的那几个依赖」，因此把这份名单也一并列出。
 */
export function RiskNotice({ visible, onAcknowledge, onClose }: RiskNoticeProps) {
  return (
    <Sheet visible={visible} title="安装插件前请先了解" onClose={onClose}>
      <AppText size={13} lineHeight={21}>
        插件是第三方编写的代码，运行时与本应用处于同一环境，能力与应用自身代码相同：
        它可以访问网络，也可以读写本应用的数据。本应用不对插件的行为提供任何限制或审核。
      </AppText>
      <AppText size={12} color={Colors.textMuted} lineHeight={19}>
        请只安装你信任其来源的插件。本应用不提供、不内置、不推荐任何插件，从哪里获取插件
        完全由你决定，由此产生的后果也由你自行承担。
      </AppText>
      <AppText size={12} color={Colors.textMuted} lineHeight={19}>
        插件可使用的第三方库：{INJECTED_MODULE_NAMES.join('、')}。
      </AppText>

      <Pressable
        onPress={onAcknowledge}
        style={{
          borderRadius: 15,
          paddingVertical: 14,
          alignItems: 'center',
          backgroundColor: Colors.accent,
        }}
      >
        <AppText size={14} weight="semibold" color={Colors.bg}>
          我已了解，继续
        </AppText>
      </Pressable>
    </Sheet>
  );
}
