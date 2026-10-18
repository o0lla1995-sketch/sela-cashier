/**
 * App.tsx — سيلّا كاشير: بوابة الجلسة (دخول أو شاشات العمل الأربع).
 * ─────────────────────────────────────────────────────────────────
 * الاستعادة من التخزين المحلي عند الإقلاع: إن بقيت جلسة صالحة
 * (الرمز لم يُبطل من المدير) يدخل التطبيق مباشرة إلى البيع.
 */
import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  I18nManager,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {fonts, palette, typography} from './theme';
import {Toaster} from './ui';
import {useSessionStore} from './store/session';
import {LoginScreen} from './screens/LoginScreen';
import {SellScreen} from './screens/SellScreen';
import {InvoicesScreen} from './screens/InvoicesScreen';
import {StatsScreen} from './screens/StatsScreen';
import {MeScreen} from './screens/MeScreen';

type TabKey = 'sell' | 'invoices' | 'stats' | 'me';

const TABS: {key: TabKey; label: string; glyph: string}[] = [
  {key: 'sell', label: 'البيع', glyph: '₪'},
  {key: 'invoices', label: 'فواتيري', glyph: '☰'},
  {key: 'stats', label: 'تقاريري', glyph: '📊'},
  {key: 'me', label: 'حسابي', glyph: '👤'},
];

function MainTabs() {
  const [tab, setTab] = useState<TabKey>('sell');
  const cashierName = useSessionStore(s => s.cashierName);
  const storeName = useSessionStore(s => s.storeName);
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.header} edges={['top']}>
        <View style={styles.headerRow}>
          <View style={styles.logoSmall}>
            <Text style={styles.logoGlyph}>س</Text>
          </View>
          <View style={{flex: 1}}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {cashierName || 'كاشير'} · {storeName || 'سيلّا'}
            </Text>
            <Text style={styles.headerSub}>متصل بنقطة البيع عبر الشبكة المحلية</Text>
          </View>
        </View>
      </SafeAreaView>
      <View style={{flex: 1}}>
        {tab === 'sell' ? <SellScreen /> : null}
        {tab === 'invoices' ? <InvoicesScreen /> : null}
        {tab === 'stats' ? <StatsScreen /> : null}
        {tab === 'me' ? <MeScreen /> : null}
      </View>
      <SafeAreaView style={styles.tabBar} edges={['bottom']}>
        {TABS.map(item => {
          const active = tab === item.key;
          return (
            <Pressable
              key={item.key}
              style={[styles.tab, active ? styles.tabActive : null]}
              onPress={() => setTab(item.key)}>
              <Text style={[styles.tabGlyph, active ? {color: palette.accent} : null]}>
                {item.glyph}
              </Text>
              <Text
                style={[
                  styles.tabLabel,
                  active ? {color: palette.accent, fontFamily: fonts.bold} : null,
                ]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </SafeAreaView>
      <Toaster />
    </View>
  );
}

export default function App() {
  const ready = useSessionStore(s => s.ready);
  const token = useSessionStore(s => s.token);
  const restore = useSessionStore(s => s.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={palette.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      {token ? <MainTabs /> : <LoginScreen />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  root: {flex: 1, backgroundColor: palette.bg},
  header: {
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  logoSmall: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlyph: {color: palette.onAccent, fontFamily: fonts.black, fontSize: 20},
  headerTitle: {
    color: palette.text,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  headerSub: {
    color: palette.textDim,
    fontFamily: fonts.regular,
    fontSize: typography.micro + 1,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  tabBar: {
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    flexDirection: 'row-reverse',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 2,
    borderTopWidth: 2,
    borderTopColor: 'transparent',
  },
  tabActive: {borderTopColor: palette.accent},
  tabGlyph: {fontSize: 18, color: palette.textDim},
  tabLabel: {
    color: palette.textDim,
    fontFamily: fonts.medium,
    fontSize: typography.micro + 1,
  },
});
