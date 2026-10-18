/**
 * screens/StatsScreen.tsx — تقارير الكاشير الخاصة به فقط: مبيعات
 * اليوم والإجمالي ومرتجعاته وأصنافه الأكثر بيعاً وآخر 14 يوماً.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Chip, EmptyState} from '../ui';
import {fonts, formatMoney, palette, spacing, typography} from '../theme';
import {CashierApi} from '../api/client';
import type {StatsPayload} from '../api/types';

export function StatsScreen() {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setStats(await CashierApi.stats());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر جلب الإحصاءات');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (stats == null && error == null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={palette.accent} size="large" />
      </View>
    );
  }

  const maxDaily = stats
    ? Math.max(
        1,
        ...stats.daily.map(day => Math.abs(day.salesTotal) || 0),
      )
    : 1;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void load()} />
      }>
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {stats ? (
        <>
          <Text style={styles.section}>اليوم</Text>
          <View style={styles.grid}>
            <Kpi label="مبيعاتي" value={formatMoney(stats.today.salesTotal)} tone="accent" />
            <Kpi label="عدد الفواتير" value={String(stats.today.salesCount)} />
            <Kpi
              label="مرتجعاتي"
              value={formatMoney(Math.abs(stats.today.returnsTotal))}
              tone="warning"
            />
            <Kpi label="الصافي" value={formatMoney(stats.today.net)} tone="success" />
          </View>

          <Text style={styles.section}>من البداية</Text>
          <View style={styles.grid}>
            <Kpi label="إجمالي المبيعات" value={formatMoney(stats.allTime.salesTotal)} tone="accent" />
            <Kpi label="الفواتير" value={String(stats.allTime.salesCount)} />
            <Kpi
              label="المرتجعات"
              value={formatMoney(Math.abs(stats.allTime.returnsTotal))}
              tone="warning"
            />
            <Kpi label="الصافي" value={formatMoney(stats.allTime.net)} tone="success" />
          </View>

          <Text style={styles.section}>الأكثر بيعاً</Text>
          {stats.topProducts.length === 0 ? (
            <EmptyState title="لا مبيعات بعد" message="أصنافك الأكثر بيعاً تظهر هنا" />
          ) : (
            <View style={{gap: 8}}>
              {stats.topProducts.map((item, index) => (
                <View key={item.productId} style={styles.topRow}>
                  <Text style={styles.topRank}>{index + 1}</Text>
                  <View style={{flex: 1}}>
                    <Text style={styles.topName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.topMeta}>
                      {item.qty % 1 === 0 ? item.qty : item.qty.toFixed(2)} وحدة
                    </Text>
                  </View>
                  <Text style={styles.topTotal}>{formatMoney(item.total)}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.section}>آخر ١٤ يوماً</Text>
          <View style={styles.barsWrap}>
            {stats.daily
              .slice()
              .reverse()
              .map(day => (
                <View key={day.day} style={styles.barCol}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${Math.max(
                            3,
                            (Math.abs(day.salesTotal) / maxDaily) * 100,
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{day.day.slice(5)}</Text>
                </View>
              ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function Kpi({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning';
}) {
  const color =
    tone === 'accent'
      ? palette.accent
      : tone === 'success'
      ? palette.success
      : tone === 'warning'
      ? palette.warning
      : palette.text;
  return (
    <View style={styles.kpi}>
      <Text style={[styles.kpiValue, {color}]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: palette.bg},
  content: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.xl + spacing.xl,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  center: {flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center'},
  section: {
    color: palette.text,
    fontFamily: fonts.black,
    fontSize: typography.heading,
    textAlign: 'right',
    marginTop: spacing.md,
  },
  grid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpi: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    alignItems: 'center',
    gap: 3,
  },
  kpiValue: {
    fontFamily: fonts.black,
    fontSize: typography.heading,
  },
  kpiLabel: {
    color: palette.textDim,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    textAlign: 'center',
  },
  topRow: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
  },
  topRank: {
    color: palette.accent,
    fontFamily: fonts.black,
    fontSize: typography.heading,
    minWidth: 22,
    textAlign: 'center',
  },
  topName: {
    color: palette.text,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    textAlign: 'right',
  },
  topMeta: {
    color: palette.textDim,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    textAlign: 'right',
  },
  topTotal: {
    color: palette.accent,
    fontFamily: fonts.bold,
    fontSize: typography.body,
  },
  barsWrap: {
    flexDirection: 'row-reverse',
    gap: 6,
    alignItems: 'flex-end',
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    minHeight: 130,
  },
  barCol: {flex: 1, alignItems: 'center', gap: 4},
  barTrack: {
    flex: 1,
    width: '100%',
    maxHeight: 84,
    justifyContent: 'flex-end',
  },
  barFill: {
    backgroundColor: palette.accent,
    borderRadius: 4,
    minHeight: 4,
  },
  barLabel: {
    color: palette.textFaint,
    fontFamily: fonts.regular,
    fontSize: 8.5,
  },
  errorCard: {
    backgroundColor: palette.dangerSoft,
    borderRadius: 12,
    padding: spacing.md,
  },
  errorText: {
    color: palette.danger,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    textAlign: 'right',
  },
});
