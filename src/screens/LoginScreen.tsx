/**
 * screens/LoginScreen.tsx — العثور على نقطة البيع والدخول.
 * ─────────────────────────────────────────────────────────────────
 * ① بث الاستكشاف يعرض كل نقاط بيع سيلا على شبكة Wi-Fi نفسها
 *    (تحديث تلقائي عند الفتح + زر إعادة البحث + إدخال يدوي
 *    للعنوان لمن شاء).
 * ② اسم المستخدم وكلمة المرور يمنحهما المدير من شاشة «الكاشير»
 *    في نقطة البيع.
 * ③ أول اتصال من هذا الجهاز يبقى «بانتظار موافقة المدير» — تظهر
 *    حالة الانتظار ويستقصي التطبيق كل 2.5 ثانية حتى يوافق أو يرفض.
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BigButton,
  Chip,
  LabeledInput,
  useToastStore,
} from '../ui';
import {fonts, palette, spacing, typography} from '../theme';
import {discoverPosStores, type DiscoveredPos} from '../native';
import {CashierApi, configureApi} from '../api/client';
import {useSessionStore} from '../store/session';

type LoginPhase = 'form' | 'pending';

export function LoginScreen() {
  const toast = useToastStore(s => s.show);
  const signIn = useSessionStore(s => s.signIn);
  const deviceId = useSessionStore(s => s.deviceId);
  const deviceLabel = useSessionStore(s => s.deviceLabel);

  const [stores, setStores] = useState<DiscoveredPos[]>([]);
  const [scanning, setScanning] = useState(true);
  const [selected, setSelected] = useState<DiscoveredPos | null>(null);
  const [manualHost, setManualHost] = useState('');
  const [manualPort, setManualPort] = useState('8950');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<LoginPhase>('form');
  const [busy, setBusy] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const scan = useCallback(async () => {
    setScanning(true);
    const found = await discoverPosStores(1800);
    setStores(found);
    setSelected(prev =>
      prev && found.some(s => s.ip === prev.ip && s.port === prev.port)
        ? prev
        : found.length > 0
        ? found[0]
        : null,
    );
    setScanning(false);
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  useEffect(() => {
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
      }
    };
  }, []);

  const target = (): {host: string; port: number} | null => {
    if (manualHost.trim().length > 0) {
      return {
        host: manualHost.trim(),
        port: Number(manualPort.trim() || '8950') || 8950,
      };
    }
    if (selected) {
      return {host: selected.ip, port: selected.port};
    }
    return null;
  };

  const attemptLogin = useCallback(async () => {
    const dest = target();
    if (!dest) {
      toast('اختر نقطة البيع من القائمة أو أدخل عنوانها يدوياً', 'error');
      return;
    }
    if (!username.trim() || !password) {
      toast('أدخل اسم المستخدم وكلمة المرور', 'error');
      return;
    }
    setBusy(true);
    try {
      configureApi(dest.host, dest.port);
      const result = await CashierApi.login({
        username: username.trim(),
        password,
        deviceId,
        deviceLabel,
      });
      if (result.status === 'pending') {
        setPhase('pending');
        toast('بانتظار موافقة المدير على هذا الجهاز في نقطة البيع…', 'info');
        return;
      }
      if (result.status === 'denied') {
        toast('رفض المدير هذا الجهاز — راجعه في نقطة البيع', 'error');
        return;
      }
      if (result.status === 'inactive') {
        toast('حسابك موقوف — طلب من المدير تفعيله', 'error');
        return;
      }
      if (result.status !== 'ok' || !result.token) {
        toast('تعذر تسجيل الدخول — أعد المحاولة', 'error');
        return;
      }
      await signIn({
        host: dest.host,
        port: dest.port,
        token: result.token,
        storeName: result.store?.name ?? 'متجر sela',
        cashierId: result.cashier?.id ?? 0,
        cashierName: result.cashier?.name ?? username.trim(),
      });
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'تعذر الاتصال بنقطة البيع',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }, [deviceLabel, deviceId, password, selected, signIn, toast, username]);

  // استقصاء الموافقة كل 2.5 ثانية أثناء الانتظار.
  useEffect(() => {
    if (phase !== 'pending') {
      return undefined;
    }
    const dest = target();
    if (!dest) {
      setPhase('form');
      return undefined;
    }
    pollTimer.current = setInterval(async () => {
      try {
        configureApi(dest.host, dest.port);
        const result = await CashierApi.login({
          username: username.trim(),
          password,
          deviceId,
          deviceLabel,
        });
        if (result.status === 'ok' && result.token) {
          clearInterval(pollTimer.current!);
          await signIn({
            host: dest.host,
            port: dest.port,
            token: result.token,
            storeName: result.store?.name ?? 'متجر sela',
            cashierId: result.cashier?.id ?? 0,
            cashierName: result.cashier?.name ?? username.trim(),
          });
        } else if (result.status === 'denied') {
          clearInterval(pollTimer.current!);
          setPhase('form');
          toast('رفض المدير هذا الجهاز', 'error');
        } else if (result.status === 'inactive') {
          clearInterval(pollTimer.current!);
          setPhase('form');
          toast('حسابك موقوف', 'error');
        }
      } catch {
        // الشبكة انقطعت لحظياً — جولة الاستقصاء التالية تعيد المحاولة.
      }
    }, 2500);
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <View style={styles.brandWrap}>
        <View style={styles.logo}>
          <Text style={styles.logoGlyph}>س</Text>
        </View>
        <Text style={styles.brand}>سيلّا كاشير</Text>
        <Text style={styles.brandSub}>
          ابحث عن نقطة البيع واتصل بها من نفس شبكة Wi-Fi
        </Text>
      </View>

      {/* نقاط البيع المكتشفة */}
      <Text style={styles.sectionTitle}>نقاط البيع على الشبكة</Text>
      {scanning ? (
        <View style={styles.scanningRow}>
          <ActivityIndicator color={palette.accent} size="small" />
          <Text style={styles.dim}>جارٍ البحث…</Text>
        </View>
      ) : stores.length === 0 ? (
        <View style={styles.noStores}>
          <Text style={styles.dim}>
            لا نقاط بيع ظهرت — تأكد أن تطبيق سيلا مفتوح وأن الخادم مفعّل،
            أو أدخل العنوان يدوياً أسفل القائمة.
          </Text>
        </View>
      ) : (
        <FlatList
          data={stores}
          keyExtractor={item => `${item.ip}:${item.port}`}
          renderItem={({item}) => {
            const active =
              selected != null &&
              selected.ip === item.ip &&
              selected.port === item.port &&
              manualHost.trim().length === 0;
            return (
              <Pressable
                style={[styles.storeRow, active ? styles.storeRowActive : null]}
                onPress={() => {
                  setManualHost('');
                  setSelected(item);
                }}>
                <View style={{flex: 1}}>
                  <Text style={styles.storeName}>{item.store}</Text>
                  <Text style={styles.dim}>
                    {item.ip}:{item.port}
                    {item.device ? ` · ${item.device}` : ''}
                  </Text>
                </View>
                {active ? <Chip label="مختار" tone="accent" /> : null}
              </Pressable>
            );
          }}
          refreshControl={
            <RefreshControl refreshing={scanning} onRefresh={() => void scan()} />
          }
          style={{maxHeight: 220}}
        />
      )}

      {/* إدخال يدوي */}
      <Text style={styles.sectionTitle}>أو أدخل العنوان يدوياً</Text>
      <View style={styles.manualRow}>
        <View style={{flex: 2}}>
          <LabeledInput
            label="عنوان نقطة البيع (IP)"
            value={manualHost}
            onChangeText={text => {
              setManualHost(text);
              if (text.trim().length > 0) {
                setSelected(null);
              }
            }}
            placeholder="مثال: 192.168.1.20"
          />
        </View>
        <View style={{flex: 1}}>
          <LabeledInput
            label="المنفذ"
            value={manualPort}
            onChangeText={setManualPort}
            placeholder="8950"
            numeric
          />
        </View>
      </View>

      {/* بيانات الدخول */}
      <Text style={styles.sectionTitle}>بيانات الدخول (يمنحها المدير)</Text>
      <LabeledInput
        label="اسم المستخدم"
        value={username}
        onChangeText={setUsername}
        placeholder="مثال: ahmad"
      />
      <LabeledInput
        label="كلمة المرور"
        value={password}
        onChangeText={setPassword}
        placeholder="••••"
        secure
      />

      {phase === 'pending' ? (
        <View style={styles.pendingCard}>
          <ActivityIndicator color={palette.warning} />
          <Text style={styles.pendingText}>
            بانتظار موافقة المدير على هذا الجهاز… سيُدخل التطبيق تلقائياً
            لحظة الموافقة.
          </Text>
        </View>
      ) : (
        <BigButton
          title="دخول"
          onPress={() => void attemptLogin()}
          busy={busy}
          disabled={busy}
        />
      )}
      <Text style={styles.footnote}>
        الحساب والصلاحيات يديرها المدير من نقطة البيع (شاشة «الكاشير») —
        أول اتصال من جهاز جديد يحتاج موافقته.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: palette.bg},
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl + spacing.xl,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  brandWrap: {alignItems: 'center', paddingVertical: spacing.xl, gap: 8},
  logo: {
    width: 74,
    height: 74,
    borderRadius: 22,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlyph: {
    color: palette.onAccent,
    fontFamily: fonts.black,
    fontSize: 40,
  },
  brand: {
    color: palette.text,
    fontFamily: fonts.black,
    fontSize: typography.title + 4,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
  brandSub: {
    color: palette.textDim,
    fontFamily: fonts.regular,
    fontSize: typography.small + 1,
    textAlign: 'center',
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    textAlign: 'right',
    marginTop: spacing.sm,
  },
  scanningRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  dim: {
    color: palette.textDim,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    textAlign: 'right',
    lineHeight: 19,
  },
  noStores: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
  },
  storeRow: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  storeRowActive: {borderColor: palette.accent},
  storeName: {
    color: palette.text,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    textAlign: 'right',
  },
  manualRow: {flexDirection: 'row-reverse', gap: spacing.sm},
  pendingCard: {
    backgroundColor: 'rgba(234,179,8,0.1)',
    borderWidth: 1,
    borderColor: palette.warning,
    borderRadius: 14,
    padding: spacing.md,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
  },
  pendingText: {
    flex: 1,
    color: palette.warning,
    fontFamily: fonts.medium,
    fontSize: typography.small + 1,
    textAlign: 'right',
    lineHeight: 19,
  },
  footnote: {
    color: palette.textFaint,
    fontFamily: fonts.regular,
    fontSize: typography.micro + 1,
    textAlign: 'center',
    lineHeight: 17,
  },
});
