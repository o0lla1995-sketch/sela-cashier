/**
 * screens/SellScreen.tsx — البيع: كتالوج المخزون + سلة + إتمام.
 * ─────────────────────────────────────────────────────────────────
 * ① الكتالوج يجلب من نقطة البيع (تحديث عند الفتح + سحب للتحديث) مع
 *    بحث بالاسم/الباركود وفلترة بالتصنيف.
 * ② منتج متعدد الوحدات (حبة/علبة/غرام) يفتح نافذة اختيار الوحدة
 *    والكمية قبل الإضافة — منتج بسيط يضاف حبة واحدة مباشرة.
 * ③ السلة: تعديل الكميات + الخصم (يقيدّه الخادم بسقف الكاشير).
 * ④ الإتمام: نقدي أو دين دفتر المتجر (اختيار زبون من القائمة).
 *    التسعير الحقيقي يحسمه الخادم من قاعدة نقطة البيع دائماً.
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {BigButton, Chip, EmptyState, LabeledInput, Sheet, useToastStore} from '../ui';
import {fonts, formatMoney, formatQty, palette, spacing, typography} from '../theme';
import {CashierApi} from '../api/client';
import type {CatalogProduct, LocalCustomer} from '../api/types';
import {useCartStore, useCatalogStore} from '../store/catalog';

/** نافذة بيع منتج: اختيار الوحدة والكمية. */
function SellUnitSheet({
  product,
  onClose,
  onAdd,
}: {
  product: CatalogProduct;
  onClose: () => void;
  onAdd: (unitId: number | null, quantity: number) => void;
}) {
  const [unitId, setUnitId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('1');

  const units = product.units;
  const chosen = units.find(u => u.id === unitId);
  const conversion = chosen ? chosen.conversion : 1;
  const rawPrice = chosen
    ? chosen.retailPrice ?? product.retailPrice * chosen.conversion
    : product.retailPrice;
  const pct = Math.max(0, Math.min(95, product.discountPct || 0));
  const unitPrice =
    pct > 0 ? Math.round(rawPrice * (1 - pct / 100) * 100) / 100 : rawPrice;
  const qty = Number(quantity.replace(',', '.')) || 0;

  return (
    <Sheet visible onClose={onClose}>
      <Text style={sheetStyles.title}>{product.name}</Text>
      {product.discountPct > 0 ? (
        <Chip label={`خصم المنتج ${product.discountPct}%`} tone="accent" />
      ) : null}
      <Text style={sheetStyles.dim}>
        {product.categoryName}
        {!product.stockUntracked
          ? ` · المخزون ${formatQty(product.stockQty / (conversion || 1))}`
          : ''}
      </Text>

      {units.length > 0 ? (
        <View style={sheetStyles.unitRow}>
          <Pressable
            style={[
              sheetStyles.unitChip,
              unitId == null ? sheetStyles.unitChipActive : null,
            ]}
            onPress={() => setUnitId(null)}>
            <Text
              style={[
                sheetStyles.unitText,
                unitId == null ? {color: palette.accent} : null,
              ]}>
              حبة
            </Text>
          </Pressable>
          {units.map(unit => (
            <Pressable
              key={unit.id}
              style={[
                sheetStyles.unitChip,
                unitId === unit.id ? sheetStyles.unitChipActive : null,
              ]}
              onPress={() => setUnitId(unit.id)}>
              <Text
                style={[
                  sheetStyles.unitText,
                  unitId === unit.id ? {color: palette.accent} : null,
                ]}>
                {unit.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <LabeledInput
        label={`الكمية (${chosen ? chosen.name : 'حبة'})`}
        value={quantity}
        onChangeText={setQuantity}
        numeric
      />
      {qty > 0 ? (
        <Text style={sheetStyles.totalLine}>
          {formatQty(qty)} × {formatMoney(unitPrice)} ={' '}
          {formatMoney(unitPrice * qty)}
        </Text>
      ) : null}

      <BigButton
        title={`أضف للسلة${qty > 0 ? ` · ${formatMoney(unitPrice * qty)}` : ''}`}
        onPress={() => {
          if (qty <= 0) {
            return;
          }
          onAdd(unitId, qty);
          onClose();
        }}
        disabled={qty <= 0}
      />
    </Sheet>
  );
}

/** اختيار زبون الدين. */
function CustomerPickerSheet({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (customer: LocalCustomer) => void;
}) {
  const toast = useToastStore(s => s.show);
  const [customers, setCustomers] = useState<LocalCustomer[] | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const payload = await CashierApi.customers();
        setCustomers(payload.customers ?? []);
      } catch (error) {
        toast(
          error instanceof Error ? error.message : 'تعذر جلب الزبائن',
          'error',
        );
        setCustomers([]);
      }
    })();
  }, [toast]);

  return (
    <Sheet visible onClose={onClose}>
      <Text style={sheetStyles.title}>بيع بالدين — اختر الزبون</Text>
      <Text style={sheetStyles.dim}>
        يُسجَّل الدين في دفتر المتجر داخل نقطة البيع فوراً باسمك.
      </Text>
      {customers == null ? (
        <ActivityIndicator color={palette.accent} />
      ) : customers.length === 0 ? (
        <EmptyState
          title="لا زبائن في الدفتر"
          message="أضف الزبون من شاشة «ديون المتجر» في نقطة البيع أولاً"
        />
      ) : (
        <ScrollView style={{maxHeight: 320}} contentContainerStyle={{gap: 8}}>
          {customers.map(customer => (
            <Pressable
              key={customer.id}
              style={sheetStyles.customerRow}
              onPress={() => {
                onPick(customer);
                onClose();
              }}>
              <View style={{flex: 1}}>
                <Text style={sheetStyles.customerName}>{customer.name}</Text>
                <Text style={sheetStyles.dim}>
                  {customer.idNumber}
                  {customer.phone ? ` · ${customer.phone}` : ''}
                </Text>
              </View>
              {customer.outstandingMinor > 0 ? (
                <Chip
                  label={`عليه ${formatMoney(customer.outstandingMinor / 100)}`}
                  tone="warning"
                />
              ) : (
                <Chip label="مسدَّد" tone="success" />
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

export function SellScreen() {
  const toast = useToastStore(s => s.show);
  const products = useCatalogStore(s => s.products);
  const loading = useCatalogStore(s => s.loading);
  const refreshCatalog = useCatalogStore(s => s.refresh);
  const cart = useCartStore();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<number | 'all'>('all');
  const [sellProduct, setSellProduct] = useState<CatalogProduct | null>(null);
  const [customerPicker, setCustomerPicker] = useState(false);
  const [discountText, setDiscountText] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<{
    number: string;
    total: number;
  } | null>(null);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  const categories = useMemo(() => {
    const map = new Map<number, string>();
    for (const product of products) {
      if (product.categoryId != null) {
        map.set(product.categoryId, product.categoryName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({id, name}));
  }, [products]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter(product => {
      if (category !== 'all' && product.categoryId !== category) {
        return false;
      }
      if (query.length === 0) {
        return true;
      }
      if (product.name.toLowerCase().includes(query)) {
        return true;
      }
      if (product.barcode && product.barcode.includes(query)) {
        return true;
      }
      return product.units.some(
        unit => unit.barcode && unit.barcode.includes(query),
      );
    });
  }, [category, products, search]);

  const tryAdd = useCallback(
    (product: CatalogProduct) => {
      if (product.hasVariants) {
        toast(
          `«${product.name}» منتج متغيرات — يُباع من نقطة البيع فقط`,
          'error',
        );
        return;
      }
      if (product.units.length > 0) {
        setSellProduct(product);
        return;
      }
      cart.add(product, null, 1);
    },
    [cart, toast],
  );

  const completeSale = useCallback(
    async (paymentType: 'cash' | 'debt', customerId?: number) => {
      if (cart.lines.length === 0) {
        return;
      }
      setBusy(true);
      try {
        const payload = await CashierApi.sale({
          lines: cart.lines.map(line => ({
            productId: line.product.id,
            unitId: line.unitId,
            quantity: line.quantity,
          })),
          discount: cart.discount,
          paymentType,
          localCustomerId: customerId,
        });
        setLastInvoice({
          number: payload.invoice.number,
          total: payload.invoice.total,
        });
        cart.clear();
        setDiscountText('');
        void refreshCatalog();
        toast(
          `تم البيع — فاتورة ${payload.invoice.number} · ${formatMoney(
            payload.invoice.total,
          )}`,
          'success',
        );
      } catch (error) {
        toast(
          error instanceof Error ? error.message : 'فشل إتمام البيع',
          'error',
        );
      } finally {
        setBusy(false);
      }
    },
    [cart, refreshCatalog, toast],
  );

  return (
    <View style={styles.screen}>
      {/* البحث والفلاتر */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="ابحث بالاسم أو الباركود…"
            placeholderTextColor={palette.textFaint}
            textAlign={I18nManager.isRTL ? 'right' : 'left'}
          />
        </View>
        <Pressable style={styles.refreshBtn} onPress={() => void refreshCatalog()}>
          <Text style={styles.refreshIcon}>⟳</Text>
        </Pressable>
      </View>
      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catsRow}
          style={{flexGrow: 0}}>
          <Pressable
            style={[styles.catChip, category === 'all' ? styles.catChipActive : null]}
            onPress={() => setCategory('all')}>
            <Text
              style={[
                styles.catText,
                category === 'all' ? {color: palette.accent} : null,
              ]}>
              الكل
            </Text>
          </Pressable>
          {categories.map(item => (
            <Pressable
              key={item.id}
              style={[
                styles.catChip,
                category === item.id ? styles.catChipActive : null,
              ]}
              onPress={() => setCategory(item.id)}>
              <Text
                style={[
                  styles.catText,
                  category === item.id ? {color: palette.accent} : null,
                ]}>
                {item.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* الشبكة */}
      <FlatList
        data={visible}
        keyExtractor={item => String(item.id)}
        numColumns={3}
        contentContainerStyle={{gap: 8, padding: 8, paddingBottom: 16}}
        columnWrapperStyle={{gap: 8}}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void refreshCatalog()} />
        }
        renderItem={({item}) => (
          <Pressable style={styles.tile} onPress={() => tryAdd(item)}>
            <Text style={styles.tileName} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.tilePrice}>
              {formatMoney(
                item.retailPrice *
                  (1 - Math.min(95, item.discountPct || 0) / 100),
              )}
            </Text>
            {item.units.length > 0 ? (
              <Text style={styles.tileUnits} numberOfLines={1}>
                {item.units.map(u => u.short).join(' · ')}
              </Text>
            ) : null}
            {item.discountPct > 0 ? (
              <Chip label={`-${item.discountPct}%`} tone="accent" />
            ) : null}
            {!item.stockUntracked && item.stockQty <= 0 ? (
              <View style={styles.tileOut}>
                <Text style={styles.tileOutText}>نفد</Text>
              </View>
            ) : null}
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              title="لا منتجات"
              message="اسحب للتحديث أو أضف منتجات من نقطة البيع"
            />
          ) : null
        }
        style={{flex: 1}}
      />

      {/* السلة */}
      {cart.lines.length > 0 ? (
        <View style={styles.cartPanel}>
          <View style={styles.cartHead}>
            <Text style={styles.cartTitle}>
              السلة · {cart.count()} صنف · {formatMoney(cart.subtotal())}
            </Text>
            <Pressable onPress={() => cart.clear()}>
              <Text style={styles.cartClear}>تفريغ</Text>
            </Pressable>
          </View>
          <ScrollView style={{maxHeight: 150}} contentContainerStyle={{gap: 6}}>
            {cart.lines.map(line => (
              <View key={line.key} style={styles.cartRow}>
                <View style={{flex: 1}}>
                  <Text style={styles.cartLineName} numberOfLines={1}>
                    {line.product.name}
                    {line.unitId != null ? ` (${line.unitName})` : ''}
                  </Text>
                  <Text style={styles.cartLineMeta}>
                    {formatQty(line.quantity)} × {formatMoney(line.unitPrice)}{' '}
                    = {formatMoney(line.unitPrice * line.quantity)}
                  </Text>
                </View>
                <View style={styles.qtyRow}>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => cart.setQuantity(line.key, line.quantity - 1)}>
                    <Text style={styles.qtyBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{formatQty(line.quantity)}</Text>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => cart.setQuantity(line.key, line.quantity + 1)}>
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.discountRow}>
            <Text style={styles.discountLabel}>خصم (₪):</Text>
            <TextInput
              style={styles.discountInput}
              value={discountText}
              onChangeText={text => {
                setDiscountText(text);
                cart.setDiscount(Number(text.replace(',', '.')) || 0);
              }}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={palette.textFaint}
            />
            <Text style={styles.totalText}>{formatMoney(cart.total())}</Text>
          </View>
          <View style={styles.checkoutRow}>
            <BigButton
              title="بيع نقدي"
              variant="success"
              onPress={() => void completeSale('cash')}
              busy={busy}
              disabled={busy}
            />
            <BigButton
              title="بيع بالدين"
              variant="ghost"
              onPress={() => setCustomerPicker(true)}
              disabled={busy}
            />
          </View>
        </View>
      ) : null}

      {lastInvoice ? (
        <Modal transparent animationType="fade" onRequestClose={() => setLastInvoice(null)}>
          <Pressable style={styles.invoiceBackdrop} onPress={() => setLastInvoice(null)}>
            <View style={styles.invoiceCard}>
              <Text style={styles.invoiceCheck}>✓</Text>
              <Text style={styles.invoiceNumber}>{lastInvoice.number}</Text>
              <Text style={styles.invoiceTotal}>
                {formatMoney(lastInvoice.total)}
              </Text>
              <Text style={styles.invoiceHint}>
                سُجِّلت في نقطة البيع باسمك — الخزينة والمخزون والديون
                تحدّثت فوراً.
              </Text>
            </View>
          </Pressable>
        </Modal>
      ) : null}

      {sellProduct ? (
        <SellUnitSheet
          product={sellProduct}
          onClose={() => setSellProduct(null)}
          onAdd={(unitId, quantity) => cart.add(sellProduct, unitId, quantity)}
        />
      ) : null}
      {customerPicker ? (
        <CustomerPickerSheet
          onClose={() => setCustomerPicker(false)}
          onPick={customer => void completeSale('debt', customer.id)}
        />
      ) : null}
    </View>
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
    lineHeight: 19,
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
  unitChipActive: {borderColor: palette.accent},
  unitText: {
    color: palette.textDim,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  totalLine: {
    color: palette.accent,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    textAlign: 'right',
  },
  customerRow: {
    backgroundColor: palette.surfaceHi,
    borderRadius: 12,
    padding: spacing.md,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
  },
  customerName: {
    color: palette.text,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    textAlign: 'right',
  },
});

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: palette.bg},
  searchRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    padding: 8,
    paddingBottom: 4,
  },
  searchBox: {
    flex: 1,
    backgroundColor: palette.surface,
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
  refreshBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshIcon: {color: palette.accent, fontSize: 20},
  catsRow: {gap: 6, paddingHorizontal: 8, paddingBottom: 8},
  catChip: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  catChipActive: {borderColor: palette.accent},
  catText: {
    color: palette.textDim,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  tile: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 8,
    gap: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileName: {
    color: palette.text,
    fontFamily: fonts.bold,
    fontSize: typography.small,
    textAlign: 'center',
  },
  tilePrice: {
    color: palette.accent,
    fontFamily: fonts.black,
    fontSize: typography.body,
  },
  tileUnits: {
    color: palette.textFaint,
    fontFamily: fonts.regular,
    fontSize: typography.micro,
  },
  tileOut: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: palette.dangerSoft,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tileOutText: {
    color: palette.danger,
    fontFamily: fonts.bold,
    fontSize: typography.micro,
  },
  cartPanel: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    gap: 8,
  },
  cartHead: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cartTitle: {
    color: palette.text,
    fontFamily: fonts.black,
    fontSize: typography.body,
    textAlign: 'right',
  },
  cartClear: {
    color: palette.danger,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  cartRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surfaceHi,
    borderRadius: 10,
    padding: 8,
  },
  cartLineName: {
    color: palette.text,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    textAlign: 'right',
  },
  cartLineMeta: {
    color: palette.textDim,
    fontFamily: fonts.regular,
    fontSize: typography.micro + 1,
    textAlign: 'right',
  },
  qtyRow: {flexDirection: 'row-reverse', alignItems: 'center', gap: 8},
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {color: palette.text, fontSize: 17, fontFamily: fonts.bold},
  qtyValue: {
    color: palette.text,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    minWidth: 34,
    textAlign: 'center',
  },
  discountRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  discountLabel: {
    color: palette.textDim,
    fontFamily: fonts.medium,
    fontSize: typography.small,
  },
  discountInput: {
    flex: 1,
    backgroundColor: palette.surfaceHi,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    color: palette.text,
    fontFamily: fonts.regular,
    paddingHorizontal: 10,
    paddingVertical: 7,
    textAlign: 'center',
  },
  totalText: {
    color: palette.accent,
    fontFamily: fonts.black,
    fontSize: typography.heading,
  },
  checkoutRow: {flexDirection: 'row-reverse', gap: 8},
  invoiceBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  invoiceCard: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.success,
    padding: spacing.xl,
    alignItems: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 360,
  },
  invoiceCheck: {color: palette.success, fontSize: 44},
  invoiceNumber: {
    color: palette.text,
    fontFamily: fonts.black,
    fontSize: typography.body,
  },
  invoiceTotal: {
    color: palette.accent,
    fontFamily: fonts.black,
    fontSize: typography.title,
  },
  invoiceHint: {
    color: palette.textDim,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    textAlign: 'center',
    lineHeight: 19,
  },
});
