/**
 * App.tsx — سيلّا كاشير v3.0: بوابة الجلسة + الهيكل.
 * ─────────────────────────────────────────────────────────────────
 * ① الاستعادة عند الإقلاع: الجلسة محفوظة محلياً — إن بقيت صالحة
 *    (الرمز لم يُبطل من المدير) يدخل التطبيق مباشرة إلى البيع.
 * ② الرأس: الشعار + أزرار [المزامنة] [شكل عرض المنتجات] [الوضع
 *    النهاري/الليلي] — شريط حالة المزامنة تحت الرأس حُذف بطلب
 *    التاجر («مزعج احذفها»)؛ حالة الاتصال تُرى من زر المزامنة
 *    (لونه + شارة العمليات المعلقة) ومن صفحة الحساب.
 * ③ أربع لسانات (البيع، الفواتير، التقارير، الحساب) — هوية نقطة
 *    البيع نفسها.
 * ④ بوابة البصمة (جديد): إن فعّلها الكاشير من الإعدادات تُطلب
 *    بصمتك عند فتح التطبيق قبل الدخول — بلا إعادة اختراع: نفس
 *    نظام نقطة البيع أندرويد.
 * ⑤ مراقبة المزامنة المستمرة تعمل طوال الجلسة وتتوقف عند الخروج
 *    — مع الاسترداد التلقائي بعد تغيّر IP لنقطة البيع.
 */
import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Appearance,
  I18nManager,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {
  fonts,
  makeStyles,
  useThemeStore,
  useThemeColors,
} from './theme';
import {Icon, type IconName} from './Icon';
import {Toaster, useToastStore} from './ui';
import {useSessionStore} from './store/session';
import {startSyncMonitor, stopSyncMonitor, useSyncStore} from './store/sync';
import {initOfflineStore} from './store/offline';
import {resetImageMemory} from './store/catalog';
import {useAppSettings, type ProductView} from './store/settings';
import {biometricAuthenticate, biometricAvailability} from './native';
import {restoreThemeMode} from './theme';
import {LoginScreen} from './screens/LoginScreen';
import {SellScreen} from './screens/SellScreen';
import {InvoicesScreen} from './screens/InvoicesScreen';
import {StatsScreen} from './screens/StatsScreen';
import {MeScreen} from './screens/MeScreen';
import {ScannerScreen} from './screens/ScannerScreen';

type TabKey = 'sell' | 'invoices' | 'stats' | 'me';

/**
 * v2.1 — حاجز الأخطاء الجذري: أي استثناء عرض (مهما كان مصدره)
 * يُلتقط هنا فتظهر بطاقة عربية واضحة وزر إعادة تشغيل الواجهة —
 * بدل الإغلاق الفوري الصامت للتطبيق. المفتاح key يتغيّر عند
 * «إعادة المحاولة» فيُعاد تركيب الشجرة من الصفر.
 */
class RootErrorBoundary extends React.Component<
  {children: React.ReactNode},
  {errorText: string | null}
> {
  state: {errorText: string | null} = {errorText: null};

  static getDerivedStateFromError(error: unknown): {
    errorText: string | null;
  } {
    const message =
      error instanceof Error ? error.message : String(error ?? '');
    return {errorText: message || 'خطأ غير معروف'};
  }

  render() {
    if (this.state.errorText != null) {
      return (
        <SafeAreaProvider>
          <SafeAreaView
            style={{flex: 1, backgroundColor: '#0E0E12'}}
            edges={['top', 'bottom']}>
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 28,
                gap: 14,
              }}>
              <View
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 20,
                  backgroundColor: 'rgba(248,113,113,0.14)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text style={{fontSize: 32}}>⚠</Text>
              </View>
              <Text
                style={{
                  color: '#F2F3F6',
                  fontSize: 18,
                  fontWeight: '800',
                  textAlign: 'center',
                }}>
                واجه خطأً في العرض
              </Text>
              <Text
                style={{
                  color: '#878D99',
                  fontSize: 13.5,
                  textAlign: 'center',
                  lineHeight: 20,
                }}>
                عملياتك المسجّلة محفوظة وسليمة. اضغط إعادة المحاولة — إن
                تكرر الخطأ أعد فتح التطبيق أو راجع المسؤول.
              </Text>
              <Text
                style={{
                  color: '#878D99',
                  fontSize: 11,
                  textAlign: 'center',
                }}
                numberOfLines={3}>
                {this.state.errorText}
              </Text>
              <Pressable
                style={{
                  backgroundColor: '#F97316',
                  borderRadius: 13,
                  paddingHorizontal: 28,
                  paddingVertical: 13,
                  marginTop: 6,
                }}
                onPress={() => this.setState({errorText: null})}>
                <Text style={{color: '#FFFFFF', fontWeight: '800', fontSize: 15}}>
                  إعادة المحاولة
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </SafeAreaProvider>
      );
    }
    return this.props.children;
  }
}

const TABS: {key: TabKey; label: string; icon: IconName}[] = [
  {key: 'sell', label: 'البيع', icon: 'cart'},
  {key: 'invoices', label: 'فواتيري', icon: 'receipt'},
  {key: 'stats', label: 'تقاريري', icon: 'chart'},
  {key: 'me', label: 'حسابي', icon: 'user'},
];

/** v3.4.1 (الجولة 78 — كاشير #4): زر الماسح أعيد تصميمه بطلب
 *  التاجر نصاً — «اجعله أيقونة بدون نص وغير ملاصق للخانة العليا»:
 *  ① بلا نص «ماسح» — أيقونة إطار الماسح (viewfinder) حول رمز
 *     الباركود فقط، فصارت مضغوطة ومهنية.
 *  ② بلا الهامش السالب (-24) الذي كان يرفع الزر خارج شريط
 *     اللسانات ملاصقاً حافته العليا — الآن يستقر مركز شريطه
 *     بهواء نظيف من الجهتين كأي لسان، مع إبقاء الهوية البارزة
 *     (لون العلامة + الظل + انضغاط اللمس). */
function ScannerDockButton({onPress}: {onPress: () => void}) {
  const styles = useScannerDockStyles();
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      style={[styles.dock, pressed ? styles.dockPressed : null]}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityLabel="الماسح اللاسلكي لنقطة البيع"
      android_ripple={{color: 'rgba(255,255,255,0.25)', borderless: true}}>
      <View style={styles.dockGlyphs}>
        <View style={styles.dockBracketTL} />
        <View style={styles.dockBracketTR} />
        <View style={styles.dockBracketBL} />
        <View style={styles.dockBracketBR} />
        <Icon name="scan" size={20} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

/** صف أزرار الرأس: المزامنة + شكل العرض + الوضع الليلي/النهاري. */
function HeaderActions() {
  const c = useThemeColors();
  const styles = useHeaderActionsStyles();
  const toast = useToastStore(s => s.show);
  const online = useSyncStore(s => s.online);
  const pending = useSyncStore(s => s.pending);
  const runCycle = useSyncStore(s => s.runCycle);
  const productView = useAppSettings(s => s.productView);
  const setProductView = useAppSettings(s => s.setProductView);
  const themeMode = useThemeStore(s => s.mode);
  const setThemeMode = useThemeStore(s => s.setMode);

  const nextView: ProductView =
    productView === 'grid' ? 'list' : productView === 'list' ? 'cards' : 'grid';
  const viewIcon: IconName =
    productView === 'list'
      ? 'layoutList'
      : productView === 'cards'
      ? 'layoutCards'
      : 'layoutGrid';
  const viewLabel =
    productView === 'grid'
      ? 'شبكة مربعات'
      : productView === 'list'
      ? 'قائمة مضغوطة'
      : 'بطاقات كبيرة';

  return (
    <View style={styles.row}>
      {/* المزامنة — لونها يتبع حالة الاتصال + شارة العمليات المعلقة */}
      <Pressable
        style={[
          styles.btn,
          online ? {borderColor: c.successSoft} : {borderColor: c.warning},
        ]}
        onPress={() => {
          void runCycle({force: true});
          toast(online ? 'جارٍ المزامنة الآن…' : 'يبحث عن نقطة البيع…', 'info');
        }}>
        <Icon name="sync" size={17} color={online ? c.success : c.warning} />
        {pending > 0 ? <View style={styles.pendingDot} /> : null}
      </Pressable>
      {/* شكل عرض المنتجات — شبكة ← قائمة ← بطاقات */}
      <Pressable
        style={styles.btn}
        onPress={() => {
          setProductView(nextView);
          toast(`شكل العرض: ${viewLabel}`, 'info');
        }}>
        <Icon name={viewIcon} size={17} color={c.text} />
      </Pressable>
      {/* الوضع الليلي/النهاري */}
      <Pressable
        style={styles.btn}
        onPress={() =>
          setThemeMode(themeMode === 'dark' ? 'light' : 'dark')
        }>
        <Icon
          name={useThemeStore.getState().resolved === 'dark' ? 'sun' : 'moon'}
          size={17}
          color={c.text}
        />
      </Pressable>
    </View>
  );
}

function MainTabs() {
  const styles = useStyles();
  const c = useThemeColors();
  const [tab, setTab] = useState<TabKey>('sell');
  /** v3.2 (الجولة 74 #7): الماسح اللاسلكي — طبقة كاملة فوق كل
   *  اللسانات: كاميرا الجوال ترسل الباركود لنقطة البيع سطح
   *  المكتب، مستقلة تماماً عن مهام الكاشير المحلية. */
  const [scannerOpen, setScannerOpen] = useState(false);

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
          <HeaderActions />
        </View>
      </SafeAreaView>
      <View style={{flex: 1}}>
        {tab === 'sell' ? <SellScreen /> : null}
        {tab === 'invoices' ? <InvoicesScreen /> : null}
        {tab === 'stats' ? <StatsScreen /> : null}
        {tab === 'me' ? <MeScreen /> : null}
      </View>
      {/* v3.3.1: شريط اللسانات بزر الماسح في مركزه — البيع
          وفواتيري حوله من الجهتين. */}
      <SafeAreaView style={styles.tabBar} edges={['bottom']}>
        {TABS.filter(item => item.key === 'sell' || item.key === 'invoices').map(
          item => {
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
          },
        )}
        <View style={styles.dockSlot}>
          <ScannerDockButton onPress={() => setScannerOpen(true)} />
        </View>
        {TABS.filter(item => item.key === 'stats' || item.key === 'me').map(
          item => {
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
          },
        )}
      </SafeAreaView>
      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
        statusBarTranslucent>
        <ScannerScreen onClose={() => setScannerOpen(false)} />
      </Modal>
      <Toaster />
    </View>
  );
}

/**
 * v3.0 — بوابة البصمة: تعمل عند فتح التطبيق فقط (وليس عند كل
 * عودة من الخلفية — الماسح والنوافذ الأصلية تُخرج التطبيق
 * باستمرار؛ نفس درس نقطة البيع). إن تعذّرت البصمة (لا يوجد جهاز
 * أو لم تُسجّل) تظهر رسالة واضحة ويمح الدخول بدونها كي لا يعلق
 * الكاشير خارج تطبيقه أبداً.
 */
function BiometricGate({onUnlock}: {onUnlock: () => void}) {
  const c = useThemeColors();
  const styles = useGateStyles();
  const toast = useToastStore(s => s.show);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const tryUnlock = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const status = await biometricAvailability();
      if (status !== 'available') {
        setUnavailable(true);
        return;
      }
      const ok = await biometricAuthenticate(
        'الدخول إلى سيلّا كاشير',
        'المس المستشعر لإكمال الدخول',
        'إلغاء',
      );
      if (ok) {
        onUnlock();
      } else {
        toast('لم تكتمل البصمة — حاول مرة أخرى', 'info');
      }
    } finally {
      setBusy(false);
    }
  };

  // مطالبة تلقائية فور ظهور البوابة.
  const askedRef = useRef(false);
  useEffect(() => {
    if (askedRef.current) {
      return;
    }
    askedRef.current = true;
    void tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.iconChip}>
          <Icon name="fingerprint" size={38} color={c.accent} />
        </View>
        <Text style={styles.title}>التطبيق مقفل بالبصمة</Text>
        <Text style={styles.sub}>
          فعّلت الدخول بالبصمة من الإعدادات — أكمل الدخول لبصمتك
          لفتح شاشة البيع.
        </Text>
        <Pressable
          style={[styles.btn, busy ? {opacity: 0.6} : null]}
          onPress={() => void tryUnlock()}
          disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnText}>الدخول بالبصمة</Text>
          )}
        </Pressable>
        {unavailable ? (
          <>
            <Text style={styles.warn}>
              البصمة غير متاحة على هذا الجهاز الآن (لم تُسجّل أو الحساس
              مشغول) — يمكنك الدخول بدونها وتعطيل القفل من الإعدادات.
            </Text>
            <Pressable style={styles.ghostBtn} onPress={onUnlock}>
              <Text style={styles.ghostText}>الدخول بدون بصمة</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

export default function App() {
  const styles = useAppStyles();
  const ready = useSessionStore(s => s.ready);
  const token = useSessionStore(s => s.token);
  const restore = useSessionStore(s => s.restore);
  const settingsLoaded = useAppSettings(s => s.loaded);
  const fingerprintLock = useAppSettings(s => s.fingerprintLock);
  // القفل يُقرر مرة واحدة عند الإقلاع (بعد تحميل الإعدادات) —
  // تحديث الإعداد بعدها لا يقفل الجلسة الجارية.
  const [locked, setLocked] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      await restoreThemeMode();
      await useAppSettings.getState().load();
      await restore();
      await initOfflineStore();
    })();
  }, [restore]);

  // قرار البوابة: فقط عندما تكون الإعدادات والجلسة جاهزتين.
  useEffect(() => {
    if (!ready || !settingsLoaded) {
      return;
    }
    if (locked == null) {
      setLocked(fingerprintLock && Boolean(token));
    }
  }, [ready, settingsLoaded, fingerprintLock, token, locked]);

  // تشغيل مراقبة المزامنة بعد الدخول وإيقافها عند الخروج.
  const hasToken = Boolean(token);
  useEffect(() => {
    if (hasToken && locked === false) {
      startSyncMonitor();
      return () => {
        stopSyncMonitor();
        resetImageMemory();
      };
    }
    return undefined;
  }, [hasToken, locked]);

  // مزامنة الوضع التلقائي مع النظام.
  useEffect(() => {
    const sub = Appearance.addChangeListener(() => {
      useThemeStore.getState().syncSystem();
    });
    useThemeStore.getState().syncSystem();
    return () => sub.remove();
  }, []);

  if (!ready || !settingsLoaded) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color="#F97316" size="large" />
      </View>
    );
  }

  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        {locked && hasToken ? (
          <BiometricGate onUnlock={() => setLocked(false)} />
        ) : token ? (
          <MainTabs />
        ) : (
          <LoginScreen />
        )}
      </SafeAreaProvider>
    </RootErrorBoundary>
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
      flexDirection: 'row',
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
      fontSize: 17.5,
      textAlign: I18nManager.isRTL ? 'right' : 'left',
    },
    headerSub: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: 11.5,
      textAlign: I18nManager.isRTL ? 'right' : 'left',
    },
    tabBar: {
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.borderSoft,
      flexDirection: 'row',
      alignItems: 'center',
    },
    /** v3.3.1: حضن زر الماسح المركزي — نفس عرض اللسان الواحد؛
     * v3.4.1: الزر مركزه تماماً (بلا رفع) مع هامش رأسي يضمن
     * عدم ملاصقته للحافة العليا للشريط. */
    dockSlot: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
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
      fontSize: 11,
    },
  }),
);

const useScannerDockStyles = makeStyles(c =>
  StyleSheet.create({
    /* v3.4.1 (الجولة 78): أيقونة فقط — ٥٠×٥٠ مركز الشريط بلا رفع
       سالب؛ قوسا إطار الماسح حول رمز الباركود مع توهج ناعم
       وانضغاط لطيف عند اللمس. */
    dock: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 50,
      height: 50,
      borderRadius: 17,
      backgroundColor: c.accent,
      borderWidth: 3,
      borderColor: c.surface,
      elevation: 6,
      shadowColor: c.accent,
      shadowOpacity: 0.35,
      shadowRadius: 8,
      shadowOffset: {width: 0, height: 3},
    },
    dockPressed: {
      transform: [{scale: 0.9}],
      elevation: 3,
      shadowRadius: 4,
      shadowOpacity: 0.2,
    },
    dockGlyphs: {
      width: 28,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dockBracketTL: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 9,
      height: 9,
      borderLeftWidth: 2.5,
      borderTopWidth: 2.5,
      borderTopLeftRadius: 5,
      borderColor: '#FFFFFF',
    },
    dockBracketTR: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 9,
      height: 9,
      borderRightWidth: 2.5,
      borderTopWidth: 2.5,
      borderTopRightRadius: 5,
      borderColor: '#FFFFFF',
    },
    dockBracketBL: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      width: 9,
      height: 9,
      borderLeftWidth: 2.5,
      borderBottomWidth: 2.5,
      borderBottomLeftRadius: 5,
      borderColor: '#FFFFFF',
    },
    dockBracketBR: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 9,
      height: 9,
      borderRightWidth: 2.5,
      borderBottomWidth: 2.5,
      borderBottomRightRadius: 5,
      borderColor: '#FFFFFF',
    },
  }),
);

const useHeaderActionsStyles = makeStyles(c =>
  StyleSheet.create({
    row: {flexDirection: 'row', gap: 7, alignItems: 'center'},
    btn: {
      width: 38,
      height: 38,
      borderRadius: 11,
      backgroundColor: c.surfaceHi,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pendingDot: {
      position: 'absolute',
      top: 4,
      left: 4,
      width: 9,
      height: 9,
      borderRadius: 999,
      backgroundColor: c.warning,
      borderWidth: 1.5,
      borderColor: c.surfaceHi,
    },
  }),
);

const useGateStyles = makeStyles(c =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: c.surface,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: c.borderSoft,
      padding: 26,
      alignItems: 'center',
      gap: 12,
    },
    iconChip: {
      width: 76,
      height: 76,
      borderRadius: 24,
      backgroundColor: c.accentSofter,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: 18,
      textAlign: 'center',
    },
    sub: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: 13.5,
      textAlign: 'center',
      lineHeight: 20,
    },
    btn: {
      backgroundColor: c.accent,
      borderRadius: 14,
      paddingHorizontal: 34,
      paddingVertical: 13,
      marginTop: 4,
    },
    btnText: {
      color: c.onAccent,
      fontFamily: fonts.black,
      fontSize: 15,
    },
    warn: {
      color: c.warning,
      fontFamily: fonts.regular,
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 18,
    },
    ghostBtn: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    ghostText: {
      color: c.textDim,
      fontFamily: fonts.medium,
      fontSize: 13,
    },
  }),
);
