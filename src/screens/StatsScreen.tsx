/**
 * screens/StatsScreen.tsx — v2.0: تقاريري — محسوبة من جهازي مباشرة.
 * ─────────────────────────────────────────────────────────────────
 * كل الإحصاءات تُشتق من الأرشيف المحلي (فواتيري من الجهازين معاً بعد
 * المزامنة) — فتقاريري تفتح وتُقرأ حتى بانقطاع الاتصال بنقطة البيع،
 * ويظهر شريط العمليات المعلقة إن وُجدت (أهم طلبات التاجر).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ScrollView, Text, View, useWindowDimensions} from 'react-native';
import {
  Badge,
  Card,
  EmptyState,
  SectionTitle,
  StatCard,
} from '../ui';
import {
  fonts,
  formatMoney,
  makeStyles,
  spacing,
  typography,
  useThemeColors,
} from '../theme';
import {computeLocalStats, type LocalStats} from '../store/offline';
import {useSyncStore} from '../store/sync';

export function StatsScreen() {
  const c = useThemeColors();
  const styles = useStyles();
  const {width: winW} = useWindowDimensions();
  const [stats, setStats] = useState<LocalStats | null>(null);
  const pending = useSyncStore(s => s.pending);
  const lastSyncAt = useSyncStore(s => s.lastSyncAt);

  const load = useCallback(async () => {
    setStats(await computeLocalStats());
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 4000);
    return () => clearInterval(timer);
  }, [load]);

  if (!stats) {
    return <View style={styles.screen} />;
  }

  const chartWidth = Math.max(220, winW - spacing.lg * 2 - 24);
  const maxDaily = Math.max(1, ...stats.daily.map(d => d.salesTotal));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{padding: spacing.lg, gap: spacing.md}}>
      {pending > 0 ? (
        <Card style={styles.pendingCard}>
          <Badge label={`${pending} عملية بانتظار المزامنة`} tone="warning" />
          <Text style={styles.dim}>
            سُجِّلت على جهازك — تُرفع لنقطة البيع فور عودة الاتصال
            تلقائياً، وعندها تصدر أرقامها الرسمية دون أي تعارض.
          </Text>
        </Card>
      ) : (
        <Card style={styles.okCard}>
          <Badge label="كل عملياتك مُزامَنة" tone="success" />
          {lastSyncAt ? (
            <Text style={styles.dim}>آخر مزامنة: {lastSyncAt.slice(0, 16)}</Text>
          ) : null}
        </Card>
      )}

      <SectionTitle title="اليوم" hint="مبيعاتك ومرتجعاتك منذ الصباح" />
      <View style={styles.grid}>
        <StatCard
          label="فواتير البيع"
          value={String(stats.todaySalesCount)}
          tone="accent"
          icon="receipt"
        />
        <StatCard
          label="المبيعات"
          value={formatMoney(stats.todaySales)}
          tone="success"
          icon="wallet"
        />
        <StatCard
          label="المرتجعات"
          value={formatMoney(Math.abs(stats.todayReturns))}
          tone="danger"
          icon="undo"
        />
        <StatCard
          label="الصافي"
          value={formatMoney(stats.net)}
          tone="accent"
          icon="chart"
        />
      </View>

      {stats.daily.length > 0 ? (
        <>
          <SectionTitle title="آخر الأيام" hint="مبيعات كل يوم" />
          <Card>
            <View style={{width: chartWidth}}>
              {stats.daily
                .slice(0, 7)
                .reverse()
                .map(day => (
                  <View key={day.day} style={styles.barRow}>
                    <Text style={styles.barLabel}>{day.day.slice(5)}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          {
                            width: `${Math.max(
                              3,
                              (day.salesTotal / maxDaily) * 100,
                            )}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.barValue}>
                      {formatMoney(day.salesTotal)}
                    </Text>
                  </View>
                ))}
            </View>
          </Card>
        </>
      ) : null}

      {stats.topProducts.length > 0 ? (
        <>
          <SectionTitle title="أكثر ما تبيعه" hint="الأعلى قيمة إجمالاً" />
          <Card style={{gap: 8}}>
            {stats.topProducts.map((product, index) => (
              <View key={product.productId} style={styles.topRow}>
                <View style={styles.rankChip}>
                  <Text style={styles.rankText}>{index + 1}</Text>
                </View>
                <View style={{flex: 1, minWidth: 0}}>
                  <Text style={styles.topName} numberOfLines={1}>
                    {product.name}
                  </Text>
                  <Text style={styles.dim}>الكمية {product.qty.toFixed(2)}</Text>
                </View>
                <Text style={styles.topValue}>{formatMoney(product.total)}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : (
        <EmptyState
          icon="chart"
          title="لا بيانات بعد"
          subtitle="ابدأ البيع — تقاريرك تُبنى هنا مباشرة من جهازك"
        />
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles(c =>
  ({
    screen: {flex: 1, backgroundColor: c.bg},
    pendingCard: {gap: 8, borderColor: c.warningSoft},
    okCard: {gap: 8, flexDirection: 'row-reverse', alignItems: 'center'},
    grid: {
      flexDirection: 'row-reverse',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    dim: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.small,
      textAlign: 'right',
      lineHeight: 18,
    },
    barRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 5,
    },
    barLabel: {
      color: c.textFaint,
      fontFamily: fonts.medium,
      fontSize: typography.micro + 2,
      width: 38,
      textAlign: 'right',
    },
    barTrack: {
      flex: 1,
      height: 13,
      borderRadius: 999,
      backgroundColor: c.surfaceAlt,
      overflow: 'hidden',
    },
    bar: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: c.accent,
    },
    barValue: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.micro + 2,
      minWidth: 66,
      textAlign: 'left',
    },
    topRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: spacing.sm,
    },
    rankChip: {
      width: 26,
      height: 26,
      borderRadius: 9,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankText: {
      color: c.accent,
      fontFamily: fonts.black,
      fontSize: typography.small,
    },
    topName: {
      color: c.text,
      fontFamily: fonts.medium,
      fontSize: typography.small + 1,
      textAlign: 'right',
    },
    topValue: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.small + 1,
    },
  }) as const,
);
