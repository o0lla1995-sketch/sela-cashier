/**
 * screens/InvoicesScreen.tsx — فواتير الكاشير نفسه: عرض وإرجاع
 * واستبدال.
 * ─────────────────────────────────────────────────────────────────
 * ① قائمة فواتيري (بيع ومرتجعات) من نقطة البيع.
 * ② فتح فاتورة يعرض أصنافها والمتبقي القابل للإرجاع منها.
 * ③ الإرجاع: تحديد الكميات لكل صنف → استرداد نقدي من الخزينة.
 * ④ الاستبدال: تحديد بضاعة بديلة من الكتالوج — الفرق يُسوّى كما
 *    في نقطة البيع تماماً (الخادم يحسب ويكتب في نفس المعاملة).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {BigButton, Chip, EmptyState, LabeledInput, Sheet, useToastStore} from '../ui';
import {
  fonts,
  formatDateTime,
  formatMoney,
  formatQty,
  palette,
  spacing,
  typography,
} from '../theme';
import {CashierApi} from '../api/client';
import type {
  CashierInvoice,
  CatalogProduct,
  InvoiceDetail,
} from '../api/types';
import {useCatalogStore} from '../store/catalog';

export function InvoicesScreen() {
  const toast = useToastStore(s => s.show);
  const refreshCatalog = useCatalogStore(s => s.refresh);
  const [invoices, setInvoices] = useState<CashierInvoice[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const payload = await CashierApi.invoices(50);
      setInvoices(payload.invoices ?? []);
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'تعذر جلب الفواتير',
        'error',
      );
      setInvoices([]);
    } finally {
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(
    async (invoiceId: number) => {
      setDetailBusy(true);
      try {
        const payload = await CashierApi.invoice(invoiceId);
        setDetail(payload);
      } catch (error) {
        toast(
          error instanceof Error ? error.message : 'تعذر فتح الفاتورة',
          'error',
        );
      } finally {
        setDetailBusy(false);
      }
    },
    [toast],
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={invoices ?? []}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{gap: 8, padding: 10, paddingBottom: 20}}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load()} />
        }
        renderItem={({item}) => (
          <Pressable
            style={styles.row}
            onPress={() => void openDetail(item.id)}>
            <View style={styles.rowIcon}>
              <Text style={styles.rowIconText}>
                {item.isReturn ? '↩' : '₪'}
              </Text>
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.rowNumber}>{item.number}</Text>
              <Text style={styles.rowMeta}>
                {formatDateTime(item.createdAt)} · {item.itemCount} صنف
              </Text>
            </View>
            <View style={{alignItems: 'flex-end', gap: 4}}>
              <Text
                style={[
                  styles.rowAmount,
                  item.isReturn ? {color: palette.warning} : null,
                ]}>
                {formatMoney(item.total)}
              </Text>
              {item.isReturn ? (
                <Chip label="مرتجع" tone="warning" />
              ) : item.returnedMinor > 0 ? (
                <Chip
                  label={`أُرجع ${formatMoney(item.returnedMinor / 100)}`}
                  tone="neutral"
                />
              ) : null}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          invoices == null ? (
            <ActivityIndicator color={palette.accent} />
          ) : (
            <EmptyState
              title="لا فواتير بعد"
              message="فواتيرك من نقطة البيع تظهر هنا لحظة إتمامها"
            />
          )
        }
      />

      {detailBusy ? (
        <View style={styles.busyOverlay}>
          <ActivityIndicator color={palette.accent} size="large" />
        </View>
      ) : null}

      {detail ? (
        <InvoiceDetailSheet
          detail={detail}
          onClose={() => setDetail(null)}
          onDone={() => {
            setDetail(null);
            void load();
            void refreshCatalog();
          }}
        />
      ) : null}
    </View>
  );
}

function InvoiceDetailSheet({
  detail,
  onClose,
  onDone,
}: {
  detail: InvoiceDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToastStore(s => s.show);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [exchange, setExchange] = useState<
    {productId: number; unitId: number | null; name: string; qty: number}[]
  >([]);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (mode: 'cash' | 'exchange') => {
      const lines = detail.lines
        .map(line => ({
          saleItemId: line.saleItemId,
          quantity: Number(quantities[line.saleItemId]?.replace(',', '.')) || 0,
        }))
        .filter(line => line.quantity > 0);
      if (lines.length === 0 && exchange.length === 0) {
        toast('حدد كميات للإرجاع أولاً', 'error');
        return;
      }
      if (mode === 'exchange' && exchange.length === 0) {
        toast('اختر بضاعة الاستبدال أولاً', 'error');
        return;
      }
      setBusy(true);
      try {
        const payload = await CashierApi.return({
          saleId: detail.sale.id,
          lines,
          exchange:
            exchange.length > 0
              ? exchange.map(item => ({
                  productId: item.productId,
                  unitId: item.unitId,
                  quantity: item.qty,
                }))
              : undefined,
          refundMethod: mode === 'exchange' ? 'none' : 'cash',
        });
        toast(
          `تم — إشعار ${payload.return.number}${
            payload.return.refundMinor > 0
              ? ` · استرداد ${formatMoney(payload.return.refundMinor / 100)}`
              : payload.return.exchangeMinor > 0
              ? ` · استبدال ${formatMoney(payload.return.exchangeMinor / 100)}`
              : ''
          }`,
          'success',
        );
        onDone();
      } catch (error) {
        toast(
          error instanceof Error ? error.message : 'فشل تسجيل الإرجاع',
          'error',
        );
      } finally {
        setBusy(false);
      }
    },
    [detail, exchange, onDone, quantities, toast],
  );

  return (
    <Sheet visible onClose={onClose}>
      <Text style={sheetStyles.title}>{detail.sale.number}</Text>
      <Text style={sheetStyles.dim}>
        {formatDateTime(detail.sale.createdAt)} · الإجمالي{' '}
        {formatMoney(detail.sale.total)}
        {detail.returnsSoFar > 0 ? ` · مرتجعات سابقة: ${detail.returnsSoFar}` : ''}
      </Text>

      {detail.sale.isReturn ? (
        <Text style={sheetStyles.dim}>
          هذه فاتورة مرتجع — لا يُرجع منها.
        </Text>
      ) : (
        <>
          <Text style={sheetStyles.section}>الكميات المطلوب إرجاعها</Text>
          <ScrollView style={{maxHeight: 260}} contentContainerStyle={{gap: 8}}>
            {detail.lines.map(line => (
              <View key={line.saleItemId} style={sheetStyles.lineRow}>
                <View style={{flex: 1}}>
                  <Text style={sheetStyles.lineName} numberOfLines={1}>
                    {line.productName}
                  </Text>
                  <Text style={sheetStyles.dim}>
                    بيع {formatQty(line.quantity)}
                    {line.unitName ? ` ${line.unitName}` : ''} · متبقٍ{' '}
                    {formatQty(line.remaining)}
                  </Text>
                </View>
                <View style={sheetStyles.qtyBox}>
                  <TextInput
                    style={sheetStyles.qtyInput}
                    value={quantities[line.saleItemId] ?? ''}
                    onChangeText={text =>
                      setQuantities(prev => ({
                        ...prev,
                        [line.saleItemId]: text,
                      }))
                    }
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={palette.textFaint}
                  />
                </View>
              </View>
            ))}
          </ScrollView>

          {exchange.length > 0 ? (
            <View style={{gap: 6}}>
              <Text style={sheetStyles.section}>بضاعة الاستبدال</Text>
              {exchange.map((item, index) => (
                <View key={`${item.productId}-${index}`} style={sheetStyles.lineRow}>
                  <View style={{flex: 1}}>
                    <Text style={sheetStyles.lineName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={sheetStyles.dim}>
                      الكمية {formatQty(item.qty)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      setExchange(prev => prev.filter((_, i) => i !== index))
                    }>
                    <Text style={sheetStyles.removeBtn}>حذف</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <BigButton
            title="إرجاع نقدي (من الخزينة)"
            variant="danger"
            busy={busy}
            disabled={busy}
            onPress={() => void submit('cash')}
          />
          <BigButton
            title="استبدال ببضاعة أخرى…"
            variant="ghost"
            disabled={busy}
            onPress={() => setExchangeOpen(true)}
          />
          {exchange.length > 0 ? (
            <BigButton
              title="تأكيد الاستبدال"
              variant="success"
              busy={busy}
              disabled={busy}
              onPress={() => void submit('exchange')}
            />
          ) : null}
        </>
      )}

      {exchangeOpen ? (
        <ExchangePickerSheet
          onClose={() => setExchangeOpen(false)}
          onPick={(product, unitId, qty) => {
            const unit = product.units.find(u => u.id === unitId);
            setExchange(prev => [
              ...prev,
              {
                productId: product.id,
                unitId,
                name:
                  product.name + (unit ? ` (${unit.name})` : ''),
                qty,
              },
            ]);
            setExchangeOpen(false);
          }}
        />
      ) : null}
    </Sheet>
  );
}

/** اختيار بضاعة الاستبدال من الكتالوج. */
function ExchangePickerSheet({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (
    product: CatalogProduct,
    unitId: number | null,
    quantity: number,
  ) => void;
}) {
  const toast = useToastStore(s => s.show);
  const products = useCatalogStore(s => s.products);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<CatalogProduct | null>(null);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('1');

  const visible = products.filter(product => {
    if (product.hasVariants) {
      return false;
    }
    if (search.trim().length === 0) {
      return true;
    }
    return product.name.toLowerCase().includes(search.trim().toLowerCase());
  });

  return (
    <Sheet visible onClose={onClose}>
      <Text style={sheetStyles.title}>بضاعة الاستبدال</Text>
      <View style={sheetStyles.searchBox}>
        <TextInput
          style={sheetStyles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="ابحث…"
          placeholderTextColor={palette.textFaint}
          textAlign={I18nManager.isRTL ? 'right' : 'left'}
        />
      </View>
      <ScrollView style={{maxHeight: 240}} contentContainerStyle={{gap: 6}}>
        {visible.slice(0, 40).map(product => (
          <Pressable
            key={product.id}
            style={[
              sheetStyles.lineRow,
              picked?.id === product.id ? {borderColor: palette.accent} : null,
            ]}
            onPress={() => {
              setPicked(product);
              setUnitId(null);
            }}>
            <View style={{flex: 1}}>
              <Text style={sheetStyles.lineName} numberOfLines={1}>
                {product.name}
              </Text>
              <Text style={sheetStyles.dim}>
                {formatMoney(
                  product.retailPrice *
                    (1 - Math.min(95, product.discountPct || 0) / 100),
                )}
              </Text>
            </View>
            {picked?.id === product.id ? <Chip label="مختار" tone="accent" /> : null}
          </Pressable>
        ))}
      </ScrollView>
      {picked ? (
        <>
          {picked.units.length > 0 ? (
            <View style={sheetStyles.unitRow}>
              <Pressable
                style={[
                  sheetStyles.unitChip,
                  unitId == null ? {borderColor: palette.accent} : null,
                ]}
                onPress={() => setUnitId(null)}>
                <Text style={sheetStyles.unitText}>حبة</Text>
              </Pressable>
              {picked.units.map(unit => (
                <Pressable
                  key={unit.id}
                  style={[
                    sheetStyles.unitChip,
                    unitId === unit.id ? {borderColor: palette.accent} : null,
                  ]}
                  onPress={() => setUnitId(unit.id)}>
                  <Text style={sheetStyles.unitText}>{unit.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <LabeledInput
            label="الكمية"
            value={quantity}
            onChangeText={setQuantity}
            numeric
          />
          <BigButton
            title="إضافة للاستبدال"
            onPress={() => {
              const qty = Number(quantity.replace(',', '.')) || 0;
              if (qty <= 0) {
                toast('كمية غير صالحة', 'error');
                return;
              }
              onPick(picked, unitId, qty);
            }}
          />
        </>
      ) : null}
    </Sheet>
  );
}

const sheetStyles = StyleSheet.create({
  title: {
    color: palette.text,
    fontFamily: fonts.black,
    fontSize: typography.heading,
    textAlign: 'right',
  },
  dim: {
    color: palette.textDim,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    textAlign: 'right',
    lineHeight: 18,
  },
  section: {
    color: palette.text,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    textAlign: 'right',
    marginTop: 4,
  },
  lineRow: {
    backgroundColor: palette.surfaceHi,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    padding: spacing.md,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  lineName: {
    color: palette.text,
    fontFamily: fonts.bold,
    fontSize: typography.small + 1,
    textAlign: 'right',
  },
  qtyBox: {
    width: 74,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
  },
  qtyInput: {
    color: palette.text,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    paddingVertical: 8,
    textAlign: 'center',
  },
  removeBtn: {
    color: palette.danger,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  searchBox: {
    backgroundColor: palette.surfaceHi,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: palette.text,
    fontFamily: fonts.regular,
    fontSize: typography.body,
    paddingVertical: 10,
  },
  unitRow: {flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8},
  unitChip: {
    backgroundColor: palette.surfaceHi,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  unitText: {
    color: palette.textDim,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
});

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: palette.bg},
  row: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: palette.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconText: {color: palette.accent, fontSize: 18, fontFamily: fonts.bold},
  rowNumber: {
    color: palette.text,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    textAlign: 'right',
  },
  rowMeta: {
    color: palette.textDim,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    textAlign: 'right',
    marginTop: 2,
  },
  rowAmount: {
    color: palette.text,
    fontFamily: fonts.black,
    fontSize: typography.body,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
