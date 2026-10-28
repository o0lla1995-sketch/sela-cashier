/**
 * components/PaymentMethodLogo.tsx — v3.4 (الجولة 77 — ملاحظة
 * التاجر الأخيرة): الشعارات الرسمية الحقيقية للبنوك والمحافظ.
 * ─────────────────────────────────────────────────────────────────
 * طلب التاجر نصاً: «لماذا لا تقوم بالبحث عن أيقونات المحافظ
 * والبنوك الحقيقة علي الانترنت واضافتها في التطبيقات بدلا من
 * هذه الايقونات الوهمية؟!» — هذه أيقونات التطبيقات الرسمية
 * المنشورة على Google Play لكل جهة (بنك فلسطين، بنك القدس،
 * البنك الإسلامي، جوال باي، بال باي، مال تشات)، تُعرض داخل رقاقة
 * بيضاء مستديرة كنمط أنظمة الدفع العالمية. أي معرّف آخر يعود
 * لرقاقة الاسم الأولى (نفس سلوك النسخ السابقة).
 */
import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {useThemeColors} from '../theme';

import bankPalestineLogo from '../assets/pm-logos/bank_palestine.png';
import bankQudsLogo from '../assets/pm-logos/bank_quds.png';
import bankIslamiLogo from '../assets/pm-logos/bank_islami.png';
import jawwalPayLogo from '../assets/pm-logos/jawwal_pay.png';
import palPayLogo from '../assets/pm-logos/palpay.png';
import malchatLogo from '../assets/pm-logos/malchat.png';

const LOGOS: Record<string, unknown> = {
  bank_palestine: bankPalestineLogo,
  bank_quds: bankQudsLogo,
  bank_islami: bankIslamiLogo,
  jawwal_pay: jawwalPayLogo,
  palpay: palPayLogo,
  malchat: malchatLogo,
};

export function PaymentMethodLogo({
  methodId,
  label,
  size = 44,
}: {
  methodId: string;
  label?: string;
  size?: number;
}): React.ReactElement {
  const c = useThemeColors();
  const source = LOGOS[methodId];
  if (source == null) {
    // جهة غير معروفة (أو نقدي) — رقاقة بحرفي الاسم كما كان.
    return (
      <View
        style={[
          styles.fallback,
          {
            width: size,
            height: size,
            borderRadius: size * 0.24,
            backgroundColor: c.accent,
          },
        ]}>
        <Text style={[styles.fallbackMark, {fontSize: size * 0.32}]}>
          {(label ?? '؟').slice(0, 2)}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={[
        styles.chip,
        {width: size, height: size, borderRadius: size * 0.24},
      ]}>
      <Image
        source={source as number}
        style={{width: '100%', height: '100%', borderRadius: size * 0.16}}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: '#FFFFFF',
    padding: 2,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1},
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackMark: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
