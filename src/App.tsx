/**
 * App.tsx — سيلّا كاشير v2.0: بوابة الجلسة + الهيكل الجديد.
 * ─────────────────────────────────────────────────────────────────
 * ① الاستعادة عند الإقلاع: الجلسة محفوظة محلياً — إن بقيت صالحة
 *    (الرمز لم يُبطل من المدير) يدخل التطبيق مباشرة إلى البيع.
 * ② شريط حالة الاتصال الحي أعلى الشاشة: متصل / دون اتصال (وضع
 *    محلي كامل) + عدد العمليات المعلقة — أهم طلبات التاجر.
 * ③ خمس لسانات بأيقونات عائلة سيلا (البيع، الفواتير، التقارير،
 *    الحساب) — هوية تطبيق نقطة البيع نفسها.
 * ④ مراقبة المزامنة المستمرة تعمل طوال الجلسة وتتوقف عند الخروج.
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
import {
  fonts,
  formatMoney,
  makeStyles,
  restoreThemeMode,
  spacing,
  typography,
  useThemeColors,
  useThemeStore,
} from './theme';
import {Icon, type IconName} from './Icon';
import {Toaster, useToastStore} from './ui';
import {useSessionStore} from './store/session';
import {startSyncMonitor, stopSyncMonitor, useSyncStore} from './store/sync';
import {initOfflineStore} from './store/offline';
import {resetImageMemory} from './store/catalog';
import {LoginScreen} from './screens/LoginScreen';
import {SellScreen} from './screens/SellScreen';
import {InvoicesScreen} from './screens/InvoicesScreen';
import {StatsScreen} from './screens/StatsScreen';
import {MeScreen} from './screens/MeScreen';

type TabKey = 'sell' | 'invoices' | 'stats' | 'me';

const TABS: {key: TabKey; label: string; icon: IconName}[] = [
  {key: 'sell', label: 'البيع', icon: 'cart'},
  {key: 'invoices', label: 'فواتيري', icon: 'receipt'},
  {key: 'stats', label: 'تقاريري', icon: 'chart'},
  {key: 'me', label: 'حسابي', icon: 'user'},
];

/** شريط حالة الاتصال الحي أعلى الشاشة. */
function SyncStatusBar() {
  const c = useThemeColors();
  const styles = useSyncBarStyles();
  const online = useSyncStore(s => s.online);
  const pending = useSyncStore(s => s.pending);
  const runCycle = useSyncStore(s => s.runCycle);
  const storeName = useSessionStore(s => s.storeName);
  const cashierName = useSessionStore(s => s.cashierName);

  return (
    <View style={[styles.bar, {backgroundColor: online ? c.surfaceAlt : c.warningSoft}]}>
      <View style={styles.dotRow}>
        <View
          style={[styles.dot, {backgroundColor: online ? c.success : c.warning}]}
        />
        <Text style={[styles.storeText, {color: online ? c.textDim : c.warning}]} numberOfLines={1}>
          {cashierName || 'كاشير'} · {storeName || 'سيلّا'}
          {online ? ' — متصل' : ' — دون اتصال: البيع يعمل محلياً'}
        </Text>
      </View>
      {pending > 0 ? (
        <Pressable
          style={styles.pendingChip}
          onPress={() => void runCycle({force: true})}>
          <Icon name="sync" size={13} color={c.warning} />
          <Text style={[styles.pendingText, {color: c.warning}]}>
            {pending} بانتظار المزامنة
          </Text>
        </Pressable>
      ) : (
        <Text style={[styles.okText, {color: c.textFaint}]}>
          {online ? 'مُزامَن' : 'جاهز للمزامنة'}
        </Text>
      )}
    </View>
  );
}

function MainTabs() {
  const styles = useStyles();
  const c = useThemeColors();
  const [tab, setTab] = useState<TabKey>('sell');
  const syncSystem = useThemeStore(s => s.syncSystem);

  useEffect(() => {
    const subscription = ({remove: () => undefined} as unknown as {
      remove: () => void;
    });
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.header} edges={['top']}>
        <View style={styles.headerRow}>
          <View style={styles.logoSmall}>
            <Text style={styles.logoGlyph}>س</Text>
          </View>
          <View style={{flex: 1, minWidth: 0}}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              سيلّا كاشير
            </Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              كل عملية تُسجَّل باسمك — حتى دون اتصال
            </Text>
          </View>
          <View style={{width: 8}} />
          <Pressable
            style={styles.themeBtn}
            onPress={() => {
              const mode = useThemeStore.getState().mode;
              useThemeStore
                .getState()
                .setMode(mode === 'dark' ? 'light' : 'dark');
            }}>
            <Icon
              name={
                useThemeStore.getState().resolved === 'dark' ? 'sun' : 'moon'
              }
              size={18}
              color={c.text}
            />
          </Pressable>
        </View>
      </SafeAreaView>
      <SyncStatusBar />
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
              <Icon
                name={item.icon}
                size={21}
                color={active ? c.accent : c.textFaint}
              />
              <Text
                style={[
                  styles.tabLabel,
                  active ? {color: c.accent, fontFamily: fonts.bold} : null,
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
  const styles = useAppStyles();
  const ready = useSessionStore(s => s.ready);
  const token = useSessionStore(s => s.token);
  const restore = useSessionStore(s => s.restore);

  useEffect(() => {
    void (async () => {
      await restoreThemeMode();
      await restore();
      await initOfflineStore();
    })();
  }, [restore]);

  // تشغيل مراقبة المزامنة بعد الدخول وإيقافها عند الخروج.
  const hasToken = Boolean(token);
  useEffect(() => {
    if (hasToken) {
      startSyncMonitor();
      return () => {
        stopSyncMonitor();
        resetImageMemory();
      };
    }
    return undefined;
  }, [hasToken]);

  // مزامنة الوضع التلقائي مع النظام.
  useEffect(() => {
    const appear = ({remove: () => undefined} as unknown as {
      remove: () => void;
    });
    useThemeStore.getState().syncSystem();
    return () => appear.remove();
  }, []);

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color="#F97316" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      {token ? <MainTabs /> : <LoginScreen />}
    </SafeAreaProvider>
  );
}

// ── الأنماط ──────────────────────────────────────────────────────
const useAppStyles = makeStyles(c =>
  StyleSheet.create({
    boot: {flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center'},
  }),
);

const useStyles = makeStyles(c =>
  StyleSheet.create({
    root: {flex: 1, backgroundColor: c.bg},
    header: {
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.borderSoft,
    },
    headerRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    logoSmall: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoGlyph: {color: c.onAccent, fontFamily: fonts.black, fontSize: 21},
    headerTitle: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.body + 1,
      textAlign: I18nManager.isRTL ? 'right' : 'left',
    },
    headerSub: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.micro + 2,
      textAlign: I18nManager.isRTL ? 'right' : 'left',
    },
    themeBtn: {
      width: 38,
      height: 38,
      borderRadius: 11,
      backgroundColor: c.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabBar: {
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.borderSoft,
      flexDirection: 'row-reverse',
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      gap: 3,
      borderTopWidth: 2,
      borderTopColor: 'transparent',
    },
    tabActive: {borderTopColor: c.accent},
    tabLabel: {
      color: c.textFaint,
      fontFamily: fonts.medium,
      fontSize: typography.micro + 2,
    },
  }),
);

const useSyncBarStyles = makeStyles(c =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: c.borderSoft,
    },
    dotRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 7,
      flex: 1,
      minWidth: 0,
    },
    dot: {width: 8, height: 8, borderRadius: 999},
    storeText: {
      fontFamily: fonts.medium,
      fontSize: typography.micro + 2,
      flexShrink: 1,
    },
    pendingChip: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 5,
      backgroundColor: c.surface,
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    pendingText: {
      fontFamily: fonts.bold,
      fontSize: typography.micro + 1,
    },
    okText: {
      fontFamily: fonts.regular,
      fontSize: typography.micro + 1,
    },
  }),
);

// مرجع تنسيق المال مستعمل في SyncStatusBar مستقبلاً — منع الحذف.
export const __formatMoney = formatMoney;
export const __useToast = useToastStore;
