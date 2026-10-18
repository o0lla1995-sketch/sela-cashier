/**
 * screens/MeScreen.tsx — v2.0: حسابي — بصلاحياتي وحالة اتصالي.
 * ─────────────────────────────────────────────────────────────────
 * ① بطاقة الحساب: اسمي، متجري، صلاحياتي كما منحها المسؤول (سقف
 *    الخصم، الدين، المرتجعات) — أوضح ما يكون.
 * ② حالة الاتصال بنقطة البيع + العمليات المعلقة + مزامنة فورية.
 * ③ الوضع النهاري/الليلي/تلقائي — نفس نظام نقطة البيع (طلب التاجر).
 * ④ تسجيل الخروج (يبقى الأرشيف المحلي — يُربط بحسابك عند الدخول).
 */
import React from 'react';
import {ScrollView, Text, View} from 'react-native';
import {
  AppButton,
  Badge,
  Card,
  SectionTitle,
  SwitchRow,
} from '../ui';
import {Icon} from '../Icon';
import {
  fonts,
  makeStyles,
  spacing,
  typography,
  useThemeStore,
  useThemeColors,
  type ThemeMode,
} from '../theme';
import {useSessionStore} from '../store/session';
import {useSyncStore} from '../store/sync';
import {initOfflineStore, listInvoices} from '../store/offline';
import {useEffect, useState} from 'react';

export function MeScreen() {
  const c = useThemeColors();
  const styles = useStyles();
  const cashierName = useSessionStore(s => s.cashierName);
  const storeName = useSessionStore(s => s.storeName);
  const perms = useSessionStore(s => s.perms);
  const signOut = useSessionStore(s => s.signOut);
  const online = useSyncStore(s => s.online);
  const pending = useSyncStore(s => s.pending);
  const lastSyncAt = useSyncStore(s => s.lastSyncAt);
  const runCycle = useSyncStore(s => s.runCycle);
  const themeMode = useThemeStore(s => s.mode);
  const setThemeMode = useThemeStore(s => s.setMode);
  const [archiveCount, setArchiveCount] = useState(0);

  useEffect(() => {
    void (async () => {
      await initOfflineStore();
      const list = await listInvoices(1000);
      setArchiveCount(list.length);
    })();
  }, []);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{padding: spacing.lg, gap: spacing.md}}>
      {/* الحساب */}
      <Card style={styles.accountCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(cashierName || 'ك').trim().charAt(0)}
          </Text>
        </View>
        <View style={{flex: 1, minWidth: 0}}>
          <Text style={styles.name} numberOfLines={1}>
            {cashierName || 'كاشير'}
          </Text>
          <Text style={styles.dim} numberOfLines={1}>
            {storeName || 'متجر سيلا'}
          </Text>
        </View>
        <Badge
          label={online ? 'متصل بنقطة البيع' : 'دون اتصال — وضع محلي'}
          tone={online ? 'success' : 'warning'}
        />
      </Card>

      {/* الصلاحيات */}
      <SectionTitle
        title="صلاحياتي"
        hint="يمنحها المسؤول من شاشة الكاشير في نقطة البيع"
      />
      <Card style={{gap: 6}}>
        <View style={styles.permRow}>
          <Icon name="percent" size={16} color={c.accent} />
          <Text style={styles.permLabel}>أقصى خصم</Text>
          <View style={{flex: 1}} />
          <Text style={styles.permValue}>{perms.maxDiscountPct}%</Text>
        </View>
        <View style={styles.permRow}>
          <Icon name="book" size={16} color={perms.canDebt ? c.success : c.danger} />
          <Text style={styles.permLabel}>البيع بالدين</Text>
          <View style={{flex: 1}} />
          <Badge
            label={perms.canDebt ? 'مسموح' : 'مقفول'}
            tone={perms.canDebt ? 'success' : 'danger'}
          />
        </View>
        <View style={styles.permRow}>
          <Icon name="undo" size={16} color={perms.canReturn ? c.success : c.danger} />
          <Text style={styles.permLabel}>المرتجعات والاستبدال</Text>
          <View style={{flex: 1}} />
          <Badge
            label={perms.canReturn ? 'مسموح' : 'مقفول'}
            tone={perms.canReturn ? 'success' : 'danger'}
          />
        </View>
      </Card>

      {/* المزامنة */}
      <SectionTitle title="المزامنة" hint="أرشيفك محفوظ على جهازك دائماً" />
      <Card style={{gap: 8}}>
        <View style={styles.permRow}>
          <Icon name="sync" size={16} color={pending > 0 ? c.warning : c.success} />
          <Text style={styles.permLabel}>عمليات بانتظار المزامنة</Text>
          <View style={{flex: 1}} />
          <Text style={styles.permValue}>{pending}</Text>
        </View>
        <View style={styles.permRow}>
          <Icon name="receipt" size={16} color={c.info} />
          <Text style={styles.permLabel}>فواتيري في الأرشيف</Text>
          <View style={{flex: 1}} />
          <Text style={styles.permValue}>{archiveCount}</Text>
        </View>
        {lastSyncAt ? (
          <Text style={styles.dim}>آخر مزامنة: {lastSyncAt.slice(0, 16)}</Text>
        ) : null}
        <AppButton
          title="مزامنة الآن"
          icon="sync"
          variant="secondary"
          small
          onPress={() => void runCycle({force: true})}
        />
        <Text style={styles.dim}>
          البيع يعمل كاملاً حتى بانقطاع الاتصال: كل عملية تُسجَّل على
          جهازك برقم مؤقت، وتصدر أرقامها الرسمية من نقطة البيع عند
          المزامنة — فلا تعارض بين حسابات الكاشيرين إطلاقاً.
        </Text>
      </Card>

      {/* المظهر */}
      <SectionTitle title="المظهر" hint="نفس أوضاع نقطة البيع" />
      <Card>
        <View style={{gap: 2}}>
          {(
            [
              {mode: 'light', label: 'الوضع النهاري', icon: 'sun'},
              {mode: 'dark', label: 'الوضع الليلي', icon: 'moon'},
              {mode: 'system', label: 'تلقائي (حسب النظام)', icon: 'settings'},
            ] as {mode: ThemeMode; label: string; icon: 'sun' | 'moon' | 'settings'}[]
          ).map(item => (
            <SwitchRow
              key={item.mode}
              label={item.label}
              icon={item.icon}
              value={themeMode === item.mode}
              onValueChange={on => {
                if (on) {
                  setThemeMode(item.mode);
                }
              }}
            />
          ))}
        </View>
      </Card>

      <AppButton
        title="تسجيل الخروج"
        icon="logout"
        variant="danger"
        onPress={() => void signOut()}
      />
      <Text style={styles.version}>سيلّا كاشير · الإصدار 2.0.0 (2)</Text>
    </ScrollView>
  );
}

const useStyles = makeStyles(c =>
  ({
    screen: {flex: 1, backgroundColor: c.bg},
    accountCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    avatar: {
      width: 54,
      height: 54,
      borderRadius: 17,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: c.onAccent,
      fontFamily: fonts.black,
      fontSize: 26,
    },
    name: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.heading,
      textAlign: 'right',
    },
    dim: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.small,
      textAlign: 'right',
      lineHeight: 19,
    },
    permRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      paddingVertical: 4,
    },
    permLabel: {
      color: c.text,
      fontFamily: fonts.medium,
      fontSize: typography.body,
      textAlign: 'right',
    },
    permValue: {
      color: c.accent,
      fontFamily: fonts.black,
      fontSize: typography.body,
    },
    version: {
      color: c.textFaint,
      fontFamily: fonts.regular,
      fontSize: typography.micro + 2,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
  }) as const,
);
