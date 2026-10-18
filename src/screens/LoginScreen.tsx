/**
 * screens/LoginScreen.tsx — v2.0: الدخول بهوية نقطة البيع.
 * ─────────────────────────────────────────────────────────────────
 * ① بحث تلقائي في الشبكة (بث UDP) — بطاقات متاجر جاهزة لللمس.
 * ② v2.0: «مسح باركود الاتصال» — نافذة QR الأصلية تقرأ بطاقة
 *    sela-cashier://IP:PORT المعروضة في شاشة الكاشير بنقطة البيع،
 *    فيتصل الجهاز فوراً بلا أي إدخال يدوي (طلب التاجر حرفياً).
 * ③ إدخال يدوي للعنوان (احتياط).
 * ④ دخول باسم المستخدم وكلمة المرور + استقصاء موافقة المدير
 *    (pending) — نفس دورة v1 لكن بالواجهة الجديدة كاملة.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  I18nManager,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  AppButton,
  Badge,
  Card,
  Field,
  Screen,
  Sheet,
  useToastStore,
} from '../ui';
import {Icon} from '../Icon';
import {
  fonts,
  makeStyles,
  spacing,
  typography,
  useThemeColors,
} from '../theme';
import {
  discoverPosStores,
  getDeviceId,
  getDeviceLabel,
  parseQrConnectPayload,
  scanQrCode,
  type DiscoveredPos,
} from '../native';
import {CashierApi, configureApi} from '../api/client';
import {useSessionStore} from '../store/session';

export function LoginScreen() {
  const c = useThemeColors();
  const styles = useStyles();
  const toast = useToastStore(s => s.show);
  const signIn = useSessionStore(s => s.signIn);

  const [phase, setPhase] = useState<'store' | 'login' | 'pending'>('store');
  const [stores, setStores] = useState<DiscoveredPos[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualHost, setManualHost] = useState('');
  const [manualPort, setManualPort] = useState('8950');
  const [chosen, setChosen] = useState<{host: string; port: number} | null>(
    null,
  );
  const [storeName, setStoreName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current != null) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  const searchStores = useCallback(async () => {
    setStores(null);
    const found = await discoverPosStores(2000);
    setStores(found);
    if (found.length === 0) {
      toast(
        'لا نقاط بيع على الشبكة — تأكد أن تطبيق نقطة البيع مفتوح وخادمه مشغّل',
        'error',
      );
    }
  }, [toast]);

  useEffect(() => {
    void searchStores();
  }, [searchStores]);

  const pickStore = useCallback(
    (store: {host: string; port: number; name: string}) => {
      configureApi(store.host, store.port);
      setChosen({host: store.host, port: store.port});
      setStoreName(store.name);
      setPhase('login');
    },
    [],
  );

  const scanQr = useCallback(async () => {
    setScanning(true);
    try {
      const raw = await scanQrCode();
      const parsed = parseQrConnectPayload(raw);
      if (!parsed) {
        toast('باركود غير معروف — امسح باركود الاتصال من شاشة الكاشير بنقطة البيع', 'error');
        return;
      }
      configureApi(parsed.host, parsed.port);
      try {
        const ping = await CashierApi.ping();
        pickStore({
          host: parsed.host,
          port: parsed.port,
          name: ping.store,
        });
        toast(`تم الاتصال بـ ${ping.store} — سجّل الدخول الآن`, 'success');
      } catch {
        toast('وصلنا العنوان لكن الخادم لا يستجيب — تأكد أن الخادم مشغّل', 'error');
      }
    } catch {
      // أُلغي المسح — بلا رسالة.
    } finally {
      setScanning(false);
    }
  }, [pickStore, toast]);

  const submitLogin = useCallback(
    async (user: string, pass: string) => {
      if (!user.trim() || !pass) {
        toast('أدخل اسم المستخدم وكلمة المرور', 'error');
        return;
      }
      setBusy(true);
      Keyboard.dismiss();
      try {
        const deviceId = await getDeviceId();
        const deviceLabel = await getDeviceLabel();
        const result = await CashierApi.login({
          username: user.trim(),
          password: pass,
          deviceId,
          deviceLabel,
        });
        if (result.status === 'pending') {
          setPhase('pending');
          toast('بانتظار موافقة المسؤول على هذا الجهاز…', 'info');
          if (pollRef.current != null) {
            clearInterval(pollRef.current);
          }
          pollRef.current = setInterval(() => {
            void (async () => {
              try {
                const again = await CashierApi.login({
                  username: user.trim(),
                  password: pass,
                  deviceId,
                  deviceLabel,
                });
                if (again.status === 'ok' && again.token && again.cashier) {
                  if (pollRef.current != null) {
                    clearInterval(pollRef.current);
                    pollRef.current = null;
                  }
                  await signIn({
                    host: chosen?.host ?? '',
                    port: chosen?.port ?? 8950,
                    token: again.token,
                    storeName: again.store?.name ?? storeName,
                    cashierId: again.cashier.id,
                    cashierName: again.cashier.name,
                    perms: again.perms,
                  });
                } else if (again.status === 'denied') {
                  if (pollRef.current != null) {
                    clearInterval(pollRef.current);
                    pollRef.current = null;
                  }
                  setPhase('login');
                  toast('رفض المسؤول هذا الجهاز — راجعه', 'error');
                }
              } catch {
                // الشبكة — نستقصي في الدورة التالية.
              }
            })();
          }, 4000);
          return;
        }
        if (result.status === 'denied') {
          toast('رفض المسؤول هذا الجهاز — راجعه', 'error');
          return;
        }
        if (result.status === 'inactive') {
          toast('حسابك موقوف — راجع المسؤول', 'error');
          return;
        }
        if (result.status === 'ok' && result.token && result.cashier) {
          await signIn({
            host: chosen?.host ?? '',
            port: chosen?.port ?? 8950,
            token: result.token,
            storeName: result.store?.name ?? storeName,
            cashierId: result.cashier.id,
            cashierName: result.cashier.name,
            perms: result.perms,
          });
          return;
        }
        toast('رد غير متوقع من الخادم', 'error');
      } catch (error) {
        toast(
          error instanceof Error ? error.message : 'فشل تسجيل الدخول',
          'error',
        );
      } finally {
        setBusy(false);
      }
    },
    [chosen, signIn, storeName, toast],
  );

  return (
    <Screen>
      <ScrollView
        style={{flex: 1}}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {/* الهوية */}
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Text style={styles.logoGlyph}>س</Text>
          </View>
          <View>
            <Text style={styles.brandTitle}>سيلّا كاشير</Text>
            <Text style={styles.brandSub}>
              اتصال سريع بنقطة البيع عبر الشبكة المحلية
            </Text>
          </View>
        </View>

        {phase === 'store' ? (
          <>
            {/* الاتصال السريع */}
            <Card style={styles.qrCard}>
              <View style={styles.qrIconChip}>
                <Icon name="qr" size={30} color={c.accent} />
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.qrTitle}>مسح باركود الاتصال</Text>
                <Text style={styles.qrSub}>
                  من شاشة «الكاشير» في نقطة البيع اضغط بطاقة «اتصال سريع
                  بباركود» ثم امسح الرمز هنا — يتصل المتجر فوراً.
                </Text>
              </View>
              <AppButton
                title={scanning ? 'جارٍ المسح…' : 'امسح'}
                icon="camera"
                small
                onPress={() => void scanQr()}
                loading={scanning}
                disabled={scanning}
              />
            </Card>

            {/* البحث في الشبكة */}
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>متاجر على شبكتك</Text>
              <Pressable onPress={() => void searchStores()} hitSlop={8}>
                <View style={styles.refreshChip}>
                  <Icon name="refresh" size={15} color={c.accent} />
                  <Text style={styles.refreshText}>تحديث</Text>
                </View>
              </Pressable>
            </View>

            {stores == null ? (
              <View style={{padding: spacing.xl, alignItems: 'center'}}>
                <ActivityIndicator color={c.accent} />
                <Text style={styles.dim}>جارٍ البحث في الشبكة…</Text>
              </View>
            ) : stores.length === 0 ? (
              <Card style={{alignItems: 'center', gap: 6, padding: spacing.lg}}>
                <Icon name="cloudOff" size={26} color={c.textFaint} />
                <Text style={styles.strong}>لا نتائج</Text>
                <Text style={styles.dim}>
                  تأكد أن تطبيق نقطة البيع مفتوح وأن خادم الكاشير مشغّل
                  من شاشة الكاشير فيه، وأنكما على نفس شبكة Wi-Fi.
                </Text>
              </Card>
            ) : (
              stores.map(store => (
                <Card
                  key={`${store.ip}:${store.port}`}
                  style={styles.storeCard}
                  onPress={() =>
                    pickStore({
                      host: store.ip,
                      port: store.port,
                      name: store.store,
                    })
                  }>
                  <View style={styles.storeIconChip}>
                    <Icon name="store" size={22} color={c.accent} />
                  </View>
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text style={styles.strong} numberOfLines={1}>
                      {store.store || 'متجر سيلا'}
                    </Text>
                    <Text style={styles.dim} numberOfLines={1}>
                      {store.ip}:{store.port}
                      {store.device ? ` · ${store.device}` : ''}
                    </Text>
                  </View>
                  <Icon
                    name={I18nManager.isRTL ? 'chevronLeft' : 'chevronRight'}
                    size={18}
                    color={c.textFaint}
                  />
                </Card>
              ))
            )}

            <AppButton
              title="إدخال العنوان يدوياً"
              variant="ghost"
              small
              onPress={() => setManualOpen(true)}
              style={{marginTop: spacing.md}}
            />
          </>
        ) : null}

        {phase === 'login' ? (
          <>
            <Card style={{gap: spacing.sm}}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <Icon name="store" size={17} color={c.success} />
                <Text style={styles.strong}>{storeName || 'متجر'}</Text>
                <View style={{flex: 1}} />
                <Pressable onPress={() => setPhase('store')} hitSlop={8}>
                  <Badge label="تغيير المتجر" tone="neutral" />
                </Pressable>
              </View>
            </Card>
            <Field
              label="اسم المستخدم"
              value={username}
              onChangeText={setUsername}
              placeholder="أعطاه لك المسؤول"
            />
            <Field
              label="كلمة المرور"
              value={password}
              onChangeText={setPassword}
              placeholder="••••"
              secure
            />
            <AppButton
              title="دخول"
              onPress={() => void submitLogin(username, password)}
              loading={busy}
              disabled={busy}
            />
          </>
        ) : null}

        {phase === 'pending' ? (
          <Card style={{alignItems: 'center', gap: 10, padding: spacing.xl}}>
            <ActivityIndicator color={c.accent} size="large" />
            <Text style={styles.strong}>بانتظار موافقة المسؤول</Text>
            <Text style={styles.dim}>
              ظهر جهازك لدى المسؤول في نقطة البيع — بمجرد موافقته يدخل
              التطبيق تلقائياً. اتركه مفتوحاً على هذه الشاشة.
            </Text>
            <AppButton
              title="إلغاء"
              variant="ghost"
              small
              onPress={() => {
                if (pollRef.current != null) {
                  clearInterval(pollRef.current);
                  pollRef.current = null;
                }
                setPhase('login');
              }}
            />
          </Card>
        ) : null}
      </ScrollView>

      {/* الإدخال اليدوي */}
      <Sheet
        visible={manualOpen}
        onClose={() => setManualOpen(false)}
        title="إدخال عنوان نقطة البيع">
        <Text style={styles.dim}>
          استعمل هذا إن لم يظهر متجرك في البحث (بعض الموجهات تمنع البث) —
          العنوان معروض في شاشة الكاشير بنقطة البيع.
        </Text>
        <Field
          label="العنوان (IP)"
          value={manualHost}
          onChangeText={setManualHost}
          placeholder="192.168.1.20"
        />
        <Field
          label="المنفذ"
          value={manualPort}
          onChangeText={setManualPort}
          placeholder="8950"
          numeric
        />
        <AppButton
          title="اتصال"
          onPress={() => {
            const host = manualHost.trim();
            const port = Number(manualPort) || 8950;
            if (!host) {
              toast('أدخل العنوان', 'error');
              return;
            }
            configureApi(host, port);
            void (async () => {
              setBusy(true);
              try {
                const ping = await CashierApi.ping();
                setManualOpen(false);
                pickStore({host, port, name: ping.store});
                toast(`تم الاتصال بـ ${ping.store}`, 'success');
              } catch {
                toast('لا يستجيب خادم على هذا العنوان', 'error');
              } finally {
                setBusy(false);
              }
            })();
          }}
          loading={busy}
          disabled={busy}
        />
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles(c =>
  ({
    content: {
      padding: spacing.lg,
      gap: spacing.md,
      paddingBottom: spacing.xxl,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginVertical: spacing.lg,
    },
    logo: {
      width: 58,
      height: 58,
      borderRadius: 18,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoGlyph: {color: c.onAccent, fontFamily: fonts.black, fontSize: 30},
    brandTitle: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.title,
      textAlign: 'right',
    },
    brandSub: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.small,
      textAlign: 'right',
      marginTop: 2,
    },
    qrCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      borderColor: c.accentSoft,
      backgroundColor: c.accentSofter,
    },
    qrIconChip: {
      width: 52,
      height: 52,
      borderRadius: 15,
      backgroundColor: c.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qrTitle: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.body,
      textAlign: 'right',
    },
    qrSub: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.micro + 2,
      textAlign: 'right',
      lineHeight: 17,
      marginTop: 2,
    },
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    sectionTitle: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.body,
      flex: 1,
      textAlign: 'right',
    },
    refreshChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: c.surfaceHi,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    refreshText: {
      color: c.accent,
      fontFamily: fonts.bold,
      fontSize: typography.micro + 2,
    },
    storeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    storeIconChip: {
      width: 44,
      height: 44,
      borderRadius: 13,
      backgroundColor: c.accentSofter,
      alignItems: 'center',
      justifyContent: 'center',
    },
    strong: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.body,
      textAlign: 'right',
    },
    dim: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.small,
      textAlign: 'right',
      lineHeight: 19,
    },
  }) as const,
);

// Modal مستورد للاستخدام المستقبلي (مانع lint للرفع غير المستعمل).
export const __keepModal = Modal;
export const __keepView = View;
