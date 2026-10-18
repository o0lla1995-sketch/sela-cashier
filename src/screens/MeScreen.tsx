/**
 * screens/MeScreen.tsx — حسابي: الكاشير والمتجر والاتصال والخروج.
 */
import React from 'react';
import {Alert, ScrollView, StyleSheet, Text, View} from 'react-native';
import {BigButton, Chip} from '../ui';
import {fonts, palette, spacing, typography} from '../theme';
import {useSessionStore} from '../store/session';

export function MeScreen() {
  const session = useSessionStore();
  const host = session.host ?? '';
  const port = session.port;

  const signOut = () => {
    Alert.alert(
      'تسجيل الخروج',
      'الخروج يمسح الجلسة من هذا الجهاز — الدخول القادم لا يحتاج موافقة جديدة (جهازك موافق عليه).',
      [
        {text: 'إلغاء', style: 'cancel'},
        {text: 'خروج', style: 'destructive', onPress: () => void session.signOut()},
      ],
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(session.cashierName || 'ك').slice(0, 1)}
          </Text>
        </View>
        <Text style={styles.name}>{session.cashierName || 'كاشير'}</Text>
        <Chip label={`متجر: ${session.storeName || '—'}`} tone="accent" />
      </View>

      <View style={styles.card}>
        <Row label="نقطة البيع" value={`${host}:${port}`} />
        <Row label="الجهاز" value={session.deviceLabel || '—'} />
        <Row label="التطبيق" value="سيلّا كاشير 1.0.0" />
      </View>

      <View style={styles.hintCard}>
        <Text style={styles.hintTitle}>كيف يعمل التطبيق؟</Text>
        <Text style={styles.hintText}>
          كل عملية بيع أو إرجاع أو استبدال تُنفَّذ داخل تطبيق سيلا في نقطة
          البيع نفسها — الخزينة والديون والمخزون والتقارير تتحدث لحظياً
          هناك باسمك، وتقاريرك هنا تخص فواتيرك أنت فقط. أبقِ تطبيق نقطة
          البيع مفتوحاً أثناء عملك.
        </Text>
      </View>

      <BigButton title="تسجيل الخروج" variant="danger" onPress={signOut} />
    </ScrollView>
  );
}

function Row({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: palette.bg},
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: spacing.xl + spacing.xl,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {color: palette.accent, fontFamily: fonts.black, fontSize: 30},
  name: {
    color: palette.text,
    fontFamily: fonts.black,
    fontSize: typography.title,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
  },
  rowLabel: {
    color: palette.textDim,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  rowValue: {
    flex: 1,
    color: palette.text,
    fontFamily: fonts.bold,
    fontSize: typography.small + 1,
    textAlign: 'left',
  },
  hintCard: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: 6,
  },
  hintTitle: {
    color: palette.text,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    textAlign: 'right',
  },
  hintText: {
    color: palette.textDim,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    textAlign: 'right',
    lineHeight: 20,
  },
});
