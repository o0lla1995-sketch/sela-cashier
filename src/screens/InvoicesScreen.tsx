/**
 * screens/InvoicesScreen.tsx — v2.0: فواتيري — أرشيف موحّد يعمل
 * دون اتصال.
 * ─────────────────────────────────────────────────────────────────
 * ① القائمة تُقرأ من الأرشيف المحلي (كل فواتيري من الجهازين معاً):
 *    محلية بانتظار المزامنة (م-N) بشارة صفراء، مرفوضة بسببها
 *    الأحمر، ومزامَنة برقمها الرسمي.
 * ② فلترة زمنية: اليوم / 7 أيام / الكل + تمييز نقدي/دين/مرتجع.
 * ③ التفاصيل من الأرشيف المحلي مباشرة (لا تحتاج اتصالاً).
 * ④ الإرجاع والاستبدال: من فواتيري المتزامنة عبر الخادم (الكميات
 *    المتبقية الحقيقية)، أو من المحلية عبر طابور المزامنة
 *    (saleClientRef) — التحقق النهائي عند الخادم وقت المزامنة.
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  I18nManager,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  AppButton,
  Badge,
  EmptyState,
  Segmented,
  Sheet,
  useToastStore,
} from '../ui';
import {Icon} from '../Icon';
import {
  fonts,
  formatMoney,
  formatQty,
  makeStyles,
  spacing,
  typography,
  useThemeColors,
} from '../theme';
import {CashierApi, localTimestamp, newClientRef} from '../api/client';
import type {InvoiceDetail} from '../api/types';
import {
  invoiceItems,
  listInvoices,
  recordLocalOp,
  type LocalInvoice,
} from '../store/offline';
import {useCatalogStore, linePrice, variantPrice} from '../store/catalog';
import {useSessionStore} from '../store/session';
import {kickSync, useSyncStore} from '../store/sync';

type Period = 'today' | 'week' | 'all';

function withinPeriod(createdAt: string, period: Period): boolean {
  if (period === 'all') {
    return true;
  }
  const day = createdAt.slice(0, 10);
  const now = new Date();
  const pad = (v: number) => String(v).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (period === 'today') {
    return day === today;
  }
  const weekAgo = new Date(now.getTime() - 6 * 86400000);
  const from = `${weekAgo.getFullYear()}-${pad(weekAgo.getMonth() + 1)}-${pad(weekAgo.getDate())}`;
  return day >= from && day <= today;
}

export function InvoicesScreen() {
  const c = useThemeColors();
  const styles = useStyles();
  const toast = useToastStore(s => s.show);
  const perms = useSessionStore(s => s.perms);
  const deviceId = useSessionStore(s => s.deviceId);
  const online = useSyncStore(s => s.online);
  const refreshCatalog = useCatalogStore(s => s.refresh);

  const [period, setPeriod] = useState<Period>('today');
  const [invoices, setInvoices] = useState<LocalInvoice[] | null>(null);
  const [openRef, setOpenRef] = useState<string | null>(null);

  const load = useCallback(async () => {
    setInvoices(await listInvoices(200));
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const filtered = useMemo(() => {
    if (!invoices) {
      return [];
    }
    return invoices.filter(inv => withinPeriod(inv.createdAt, period));
  }, [invoices, period]);

  const openInvoice = filtered.find(inv => inv.ref === openRef) ?? null;

  return (
    <View style={styles.screen}>
      <View style={styles.padded}>
        <Segmented<Period>
          value={period}
          onChange={setPeriod}
          options={[
            {value: 'today', label: 'اليوم'},
            {value: 'week', label: '7 أيام'},
            {value: 'all', label: 'الكل'},
          ]}
        />
      </View>
      {invoices == null ? (
        <ActivityIndicator color={c.accent} style={{marginTop: 24}} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="لا فواتير في هذه الفترة"
          subtitle="كل فاتورة تُسجَّل على جهازك — حتى دون اتصال بنقطة البيع"
        />
      ) : (
        <ScrollView
          contentContainerStyle={{padding: spacing.md, gap: 8, paddingBottom: 24}}>
          {filtered.map(invoice => (
            <Pressable
              key={invoice.ref}
              style={styles.row}
              onPress={() => setOpenRef(invoice.ref)}>
              <View
                style={[
                  styles.kindChip,
                  invoice.kind === 'return'
                    ? {backgroundColor: c.dangerSoft}
                    : invoice.payKind === 'debt'
                    ? {backgroundColor: c.infoSoft}
                    : {backgroundColor: c.successSoft},
                ]}>
                <Icon
                  name={invoice.kind === 'return' ? 'undo' : 'receipt'}
                  size={16}
                  color={
                    invoice.kind === 'return'
                      ? c.danger
                      : invoice.payKind === 'debt'
                      ? c.info
                      : c.success
                  }
                />
              </View>
              <View style={{flex: 1, minWidth: 0}}>
                <View style={{flexDirection: 'row-reverse', alignItems: 'center', gap: 6}}>
                  <Text style={styles.number} numberOfLines={1}>
                    {invoice.displayNumber}
                  </Text>
                  {invoice.status === 'pending' ? (
                    <Badge label="بانتظار المزامنة" tone="warning" />
                  ) : invoice.status === 'rejected' ? (
                    <Badge label="مرفوضة" tone="danger" />
                  ) : null}
                </View>
                <Text style={styles.dim}>
                  {invoice.createdAt.slice(0, 16)}
                  {invoice.kind === 'sale' && invoice.payKind === 'debt'
                    ? ' · دين'
                    : ''}
                  {invoice.customerName ? ` · ${invoice.customerName}` : ''}
                  {invoice.kind === 'return' ? ' · مرتجع' : ''}
                </Text>
              </View>
              <Text
                style={[
                  styles.total,
                  invoice.kind === 'return' ? {color: c.danger} : null,
                ]}>
                {formatMoney(invoice.total)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {openInvoice ? (
        <InvoiceDetailSheet
          invoice={openInvoice}
          online={online}
          canReturn={perms.canReturn}
          deviceId={deviceId}
          onClose={() => setOpenRef(null)}
          onChanged={() => {
            void load();
            void refreshCatalog();
          }}
          onToast={toast}
        />
      ) : null}
    </View>
  );
}

/** تفاصيل فاتورة من الأرشيف المحلي + الإرجاع/الاستبدال. */
function InvoiceDetailSheet({
  invoice,
  online,
  canReturn,
  deviceId,
  onClose,
  onChanged,
  onToast,
}: {
  invoice: LocalInvoice;
  online: boolean;
  canReturn: boolean;
  deviceId: string;
  onClose: () => void;
  onChanged: () => void;
  onToast: (message: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const c = useThemeColors();
  const styles = useDetailStyles();
  const products = useCatalogStore(s => s.products);
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof invoiceItems>>
  >([]);
  const [serverDetail, setServerDetail] = useState<InvoiceDetail | null>(null);
  const [returnMode, setReturnMode] = useState(false);
  const [exchangeMode, setExchangeMode] = useState(false);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [exchangeProductId, setExchangeProductId] = useState<number | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const isSale = invoice.kind === 'sale';

  useEffect(() => {
    void invoiceItems(invoice.ref).then(setItems);
  }, [invoice.ref]);

  // تفاصيل الخادم (الكميات المتبقية الحقيقية) — للفواتير المتزامنة.
  useEffect(() => {
    setServerDetail(null);
    if (invoice.status !== 'synced' || !online || invoice.syncedNumber == null) {
      return;
    }
    void (async () => {
      try {
        // البحث عن معرف الخادم عبر القائمة — نستخدم /api/invoice
        // بمعرف الخادم: نجلب قائمة الفواتير ونجده برقمه.
        const list = await CashierApi.invoices(100, 0);
        const hit = (list.invoices ?? []).find(
          inv => inv.number === invoice.syncedNumber,
        );
        if (hit) {
          const detail = await CashierApi.invoice(hit.id);
          setServerDetail(detail);
        }
      } catch {
        // الأرشيف المحلي يكفي للعرض؛ الإرجاع يحتاج الاتصال أو الطابور.
      }
    })();
  }, [invoice.ref, invoice.status, invoice.syncedNumber, online]);

  const remainingFor = useCallback(
    (index: number): number => {
      if (serverDetail != null && items[index] != null) {
        const line = serverDetail.lines.find(
          l => l.productId === items[index].productId,
        );
        if (line) {
          return line.remaining;
        }
      }
      // محلياً: الكمية كاملة (التحقق النهائي عند الخادم).
      return items[index]?.quantity ?? 0;
    },
    [items, serverDetail],
  );

  const submitReturn = useCallback(
    async (withExchange: boolean) => {
      if (!canReturn) {
        onToast('المرتجعات مقفولة لحسابك — راجع المسؤول', 'error');
        return;
      }
      const selected = items
        .map((item, index) => ({item, index}))
        .filter(({index}) => (quantities[index] ?? 0) > 0)
        .map(({item, index}) => ({
          saleItemId: item.id,
          productId: item.productId,
          quantity: quantities[index],
        }));
      if (selected.length === 0) {
        onToast('حدد أصنافاً للإرجاع', 'error');
        return;
      }

      // بناء بدائل الاستبدال من الكتالوج.
      const exchangeLines: {
        productId: number;
        quantity: number;
        unitId: number | null;
        variantId: number | null;
      }[] = [];
      if (withExchange) {
        if (exchangeProductId == null) {
          onToast('اختر منتج الاستبدال', 'error');
          return;
        }
        exchangeLines.push({
          productId: exchangeProductId,
          quantity: 1,
          unitId: null,
          variantId: null,
        });
      }

      setBusy(true);
      const createdAt = localTimestamp();
      const clientRef = newClientRef(deviceId || 'dev');

      // قيمة المرتجع تقريبية محلياً (للعرض والأرشيف) — الخادم يحسم.
      const refundValue = selected.reduce((sum, s) => {
        const item = items.find(i => i.id === s.saleItemId);
        return sum + (item ? item.unitPrice * s.quantity : 0);
      }, 0);
      const exchangeValue = withExchange
        ? (() => {
            const product = products.find(p => p.id === exchangeProductId);
            return product
              ? product.hasVariants
                ? variantPrice(product, product.variants[0])
                : linePrice(product, null)
              : 0;
          })()
        : 0;
      const net = withExchange ? exchangeValue - refundValue : -refundValue;

      // ① محاولة مباشرة (فاتورة متزامنة + اتصال).
      if (invoice.status === 'synced' && online) {
        try {
          const list = await CashierApi.invoices(100, 0);
          const hit = (list.invoices ?? []).find(
            inv => inv.number === invoice.syncedNumber,
          );
          if (!hit) {
            throw new Error('لم تُعثر الفاتورة عند الخادم');
          }
          await CashierApi.return({
            saleId: hit.id,
            lines: selected.map(s => ({
              saleItemId: s.saleItemId,
              quantity: s.quantity,
            })),
            exchange: exchangeLines.length > 0 ? exchangeLines : undefined,
            refundMethod: withExchange ? 'none' : 'cash',
            clientRef,
            createdAt,
          });
          onToast('سُجِّل المرتجع في نقطة البيع', 'success');
          onChanged();
          onClose();
          return;
        } catch (error) {
          onToast(
            error instanceof Error ? error.message : 'فشل تسجيل المرتجع',
            'error',
          );
          return;
        }
      }

      // ② الطابور المحلي — يعمل حتى دون اتصال (saleClientRef يحل
      //    الفاتورة الأصلية عند الخادم حتى لو كانت ما تزال معلقة).
      try {
        await recordLocalOp({
          ref: clientRef,
          kind: 'return',
          displayNumber: `م-ر-${invoice.displayNumber}`,
          payKind: withExchange ? 'exchange' : 'refund',
          total: net,
          discount: 0,
          customerName: null,
          createdAt,
          lines: selected.map(s => {
            const item = items.find(i => i.id === s.saleItemId);
            return {
              productId: s.productId,
              name: item?.name ?? `#${s.productId}`,
              variantId: item?.variantLabel ? -1 : null,
              variantLabel: item?.variantLabel ?? null,
              unitId: null,
              unitName: item?.unitName ?? null,
              quantity: s.quantity,
              unitPrice: item?.unitPrice ?? 0,
              lineTotal: (item?.unitPrice ?? 0) * s.quantity,
            };
          }),
          payload: {
            saleClientRef: invoice.ref,
            lines: selected.map(s => ({
              saleItemId: s.saleItemId,
              quantity: s.quantity,
            })),
            exchange: exchangeLines.length > 0 ? exchangeLines : undefined,
            refundMethod: withExchange ? 'none' : 'cash',
            clientRef,
            createdAt,
          },
        });
        onToast('سُجِّل المرتجع محلياً — يُزامَن فور عودة الاتصال', 'success');
        kickSync();
        onChanged();
        onClose();
      } catch (error) {
        onToast(
          error instanceof Error ? error.message : 'تعذر تسجيل المرتجع',
          'error',
        );
      } finally {
        setBusy(false);
      }
    },
    [
      canReturn,
      deviceId,
      exchangeProductId,
      invoice.displayNumber,
      invoice.ref,
      invoice.status,
      invoice.syncedNumber,
      items,
      onChanged,
      onClose,
      onToast,
      online,
      products,
      quantities,
    ],
  );

  return (
    <Sheet visible onClose={onClose} title={`فاتورة ${invoice.displayNumber}`}>
      <View style={styles.metaRow}>
        <Badge
          label={
            invoice.kind === 'return'
              ? 'مرتجع'
              : invoice.payKind === 'debt'
              ? 'بيع بالدين'
              : 'بيع نقدي'
          }
          tone={
            invoice.kind === 'return' ? 'danger' : invoice.payKind === 'debt' ? 'info' : 'success'
          }
        />
        {invoice.status === 'pending' ? (
          <Badge label="بانتظار المزامنة" tone="warning" />
        ) : null}
        {invoice.status === 'rejected' ? (
          <Badge label="مرفوضة" tone="danger" />
        ) : null}
        <View style={{flex: 1}} />
        <Text style={styles.dim}>{invoice.createdAt.slice(0, 16)}</Text>
      </View>

      {invoice.status === 'rejected' && invoice.rejectReason ? (
        <View style={styles.rejectBox}>
          <Icon name="alert" size={16} color={c.danger} />
          <Text style={styles.rejectText}>{invoice.rejectReason}</Text>
        </View>
      ) : null}

      {items.length === 0 ? (
        <Text style={styles.dim}>
          فاتورة من جهاز آخر — تفاصيل أصنافها محفوظة في نقطة البيع.
        </Text>
      ) : (
        items.map((item, index) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={{flex: 1}}>
              <Text style={styles.itemName}>
                {item.name}
                {item.variantLabel ? ` (${item.variantLabel})` : ''}
                {item.unitName && item.unitName !== 'حبة'
                  ? ` (${item.unitName})`
                  : ''}
              </Text>
              <Text style={styles.dim}>
                {formatQty(item.quantity)} × {formatMoney(item.unitPrice)} ={' '}
                {formatMoney(item.lineTotal)}
              </Text>
            </View>
            {isSale && returnMode ? (
              <View style={styles.qtyPick}>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() =>
                    setQuantities(q => ({
                      ...q,
                      [index]: Math.min(
                        remainingFor(index),
                        (q[index] ?? 0) + 1,
                      ),
                    }))
                  }>
                  <Text style={styles.qtyBtnText}>+</Text>
                </Pressable>
                <Text style={styles.qtyValue}>
                  {quantities[index] ?? 0}
                </Text>
                <Pressable
                  style={styles.qtyBtn}
                  onPress={() =>
                    setQuantities(q => ({...q, [index]: Math.max(0, (q[index] ?? 0) - 1)}))
                  }>
                  <Text style={styles.qtyBtnText}>−</Text>
                </Pressable>
                <Text style={styles.remaining}>
                  / {formatQty(remainingFor(index))}
                </Text>
              </View>
            ) : null}
          </View>
        ))
      )}

      <View style={styles.totalsRow}>
        <Text style={styles.dim}>
          الخصم {formatMoney(invoice.discount)} · الإجمالي
        </Text>
        <Text style={styles.totalText}>{formatMoney(invoice.total)}</Text>
      </View>

      {isSale && canReturn && items.length > 0 ? (
        <>
          {!returnMode ? (
            <AppButton
              title="إرجاع / استبدال أصناف"
              icon="undo"
              variant="secondary"
              onPress={() => setReturnMode(true)}
            />
          ) : (
            <>
              {exchangeMode ? (
                <View style={styles.exchangeBox}>
                  <Text style={styles.dim}>
                    منتج الاستبدال — يُسعَّر من نقطة البيع بأسعاره الحالية:
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{gap: 6}}>
                    {products.slice(0, 24).map(product => (
                      <Pressable
                        key={product.id}
                        style={[
                          styles.exchangeChip,
                          exchangeProductId === product.id
                            ? {borderColor: c.accent}
                            : null,
                        ]}
                        onPress={() => setExchangeProductId(product.id)}>
                        <Text
                          style={styles.exchangeName}
                          numberOfLines={1}>
                          {product.name}
                        </Text>
                        <Text style={styles.exchangePrice}>
                          {formatMoney(
                            product.hasVariants
                              ? variantPrice(product, product.variants[0])
                              : linePrice(product, null),
                          )}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
              <View style={{flexDirection: 'row-reverse', gap: 8}}>
                <AppButton
                  title="تأكيد الإرجاع"
                  variant="danger"
                  small
                  style={{flex: 1}}
                  loading={busy}
                  disabled={busy}
                  onPress={() => void submitReturn(false)}
                />
                <AppButton
                  title={exchangeMode ? 'تأكيد الاستبدال' : 'استبدال'}
                  variant="primary"
                  small
                  style={{flex: 1}}
                  loading={busy}
                  disabled={busy}
                  onPress={() => {
                    if (exchangeMode) {
                      void submitReturn(true);
                    } else {
                      setExchangeMode(true);
                    }
                  }}
                />
                <AppButton
                  title="إلغاء"
                  variant="ghost"
                  small
                  onPress={() => {
                    setReturnMode(false);
                    setExchangeMode(false);
                    setQuantities({});
                  }}
                />
              </View>
              {invoice.status === 'pending' ? (
                <Text style={styles.dim}>
                  الفاتورة الأصلية بانتظار المزامنة — المرتجع سيُحل عنها
                  تلقائياً بعد مزامنتها (طابورك بالتسلسل).
                </Text>
              ) : !online ? (
                <Text style={styles.dim}>
                  لا اتصال الآن — يُسجَّل المرتجع محلياً ويُزامَن تلقائياً.
                </Text>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </Sheet>
  );
}

const useStyles = makeStyles(c =>
  ({
    screen: {flex: 1, backgroundColor: c.bg},
    padded: {padding: spacing.md, paddingBottom: 4},
    row: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.borderSoft,
      padding: spacing.md,
    },
    kindChip: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    number: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.body,
      textAlign: 'right',
      flexShrink: 1,
    },
    dim: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.small,
      textAlign: 'right',
      lineHeight: 18,
    },
    total: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.body,
    },
  }) as const,
);

const useDetailStyles = makeStyles(c =>
  ({
    metaRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    dim: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.small,
      textAlign: 'right',
      lineHeight: 18,
    },
    rejectBox: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.dangerSoft,
      borderRadius: 10,
      padding: spacing.sm + 2,
    },
    rejectText: {
      color: c.danger,
      fontFamily: fonts.medium,
      fontSize: typography.small,
      flex: 1,
      textAlign: 'right',
    },
    itemRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surfaceAlt,
      borderRadius: 10,
      padding: spacing.sm + 2,
    },
    itemName: {
      color: c.text,
      fontFamily: fonts.medium,
      fontSize: typography.small + 1,
      textAlign: 'right',
    },
    qtyPick: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      gap: 7,
    },
    qtyBtn: {
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qtyBtnText: {color: c.text, fontSize: 16, fontFamily: fonts.bold},
    qtyValue: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.body,
      minWidth: 26,
      textAlign: 'center',
    },
    remaining: {
      color: c.textFaint,
      fontFamily: fonts.regular,
      fontSize: typography.micro,
    },
    totalsRow: {
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: c.borderSoft,
      paddingTop: spacing.sm,
    },
    totalText: {
      color: c.accent,
      fontFamily: fonts.black,
      fontSize: typography.heading,
    },
    exchangeBox: {gap: 8},
    exchangeChip: {
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 2,
      maxWidth: 130,
    },
    exchangeName: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.small,
      textAlign: 'right',
    },
    exchangePrice: {
      color: c.accent,
      fontFamily: fonts.black,
      fontSize: typography.micro + 2,
      textAlign: 'right',
    },
  }) as const,
);
