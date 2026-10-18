/**
 * screens/SellScreen.tsx — v2.0: البيع بهوية نقطة البيع كاملة.
 * ─────────────────────────────────────────────────────────────────
 * ① شبكة منتجات ببطاقات تحمل الصور فعلياً (تُجلب كسولاً وتُخزَّن).
 * ② بحث بالاسم/الباركود بزر مسح واضح + فلترة تصنيفات.
 * ③ نافذة بيع كاملة: الوحدات (حبة/علبة/غرام) + المتغيرات
 *    (لون×مقاس للملابس، حجم للمطاعم) + الكمية/الوزن — إصلاح «خطأ
 *    منتج متغيرات» نهائياً.
 * ④ سلة بنمط نقطة البيع: تعديل كميات، خصم بسقف صلاحيتك، إجماليات.
 * ⑤ إتمام نقدي أو دين دفتر المتجر (إن سمح المسؤول).
 * ⑥ يعمل كاملاً دون اتصال: العملية تُسجَّل محلياً برقم مؤقت وتُزامَن
 *    فور عودة الشبكة — بلا أي ازدواج أو تعارض أرقام (clientRef).
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  I18nManager,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AppButton,
  Badge,
  EmptyState,
  Field,
  SearchBar,
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
import type {CatalogProduct, CatalogVariant, LocalCustomer} from '../api/types';
import {
  availableStock,
  imageStore,
  linePrice,
  useCartStore,
  useCatalogStore,
  variantLabel as makeVariantLabel,
  variantPrice,
} from '../store/catalog';
import {useSessionStore} from '../store/session';
import {loadCachedCustomers, nextLocalNumber, recordLocalOp} from '../store/offline';
import {kickSync, useSyncStore} from '../store/sync';

// ── صورة منتج كسولة (بطاقة) ──────────────────────────────────────
function ProductThumb({product}: {product: CatalogProduct}) {
  const c = useThemeColors();
  // v2.1 — إصلاح الانهيار القاتل: كان الخطاف يُستدعى داخل فرع واحد
  // فقط (بعد return مبكر)، فحين تصل الصورة ويعاد الرسم تختلف عدد
  // الخطافات → «Rendered fewer hooks» → إغلاق فوري للتطبيق، وبما أن
  // الصور مخزنة على القرص يتكرر الانهيار مع كل إقلاع (حلقة موت).
  // القاعدة: كل الخطافات في أعلى المكون دائماً قبل أي return.
  const thumbStyles = useThumbStyles();
  const [base64, setBase64] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (product.hasImage) {
      void imageStore.get(product.id).then(image => {
        if (alive) {
          setBase64(image);
        }
      });
    }
    return () => {
      alive = false;
    };
  }, [product.hasImage, product.id]);

  if (base64) {
    return (
      <Image
        source={{uri: `data:image/jpeg;base64,${base64}`}}
        style={{width: '100%', height: 62, borderRadius: 9}}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={thumbStyles.placeholder}>
      {product.hasVariants ? (
        <Icon name="shapes" size={20} color={c.textFaint} />
      ) : (
        <Text style={thumbStyles.glyph}>
          {String(product.name ?? '').trim().charAt(0)}
        </Text>
      )}
    </View>
  );
}

const useThumbStyles = makeStyles(c =>
  ({
    placeholder: {
      width: '100%',
      height: 62,
      borderRadius: 9,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glyph: {
      color: c.textFaint,
      fontFamily: fonts.black,
      fontSize: 22,
    },
  }) as const,
);

// ── نافذة بيع منتج: وحدات + متغيرات + كمية/وزن ───────────────────
function SellProductSheet({
  product,
  onClose,
  onAdd,
}: {
  product: CatalogProduct;
  onClose: () => void;
  onAdd: (
    unitId: number | null,
    quantity: number,
    variantId: number | null,
  ) => void;
}) {
  const c = useThemeColors();
  const styles = useSheetStyles();
  const [variantId, setVariantId] = useState<number | null>(null);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState('1');

  const clothingVariants = useMemo(
    () => product.variants.filter(v => v.kind === 'variant'),
    [product.variants],
  );
  const sizeVariants = useMemo(
    () => product.variants.filter(v => v.kind === 'size'),
    [product.variants],
  );
  const colors = useMemo(
    () => Array.from(new Set(clothingVariants.map(v => v.color))),
    [clothingVariants],
  );
  const [color, setColor] = useState<string>(colors[0] ?? '');
  const sizesOfColor = useMemo(
    () => clothingVariants.filter(v => v.color === color),
    [clothingVariants, color],
  );

  const chosenVariant: CatalogVariant | null = useMemo(() => {
    if (sizeVariants.length > 0) {
      return sizeVariants.find(v => v.id === variantId) ?? null;
    }
    if (clothingVariants.length > 0) {
      return clothingVariants.find(v => v.id === variantId) ?? null;
    }
    return null;
  }, [clothingVariants, sizeVariants, variantId]);

  // اختيار أول متغير تلقائياً (أول لون+مقاس متاح).
  useEffect(() => {
    if (sizeVariants.length > 0 && variantId == null) {
      setVariantId(sizeVariants[0].id);
    }
  }, [sizeVariants, variantId]);
  useEffect(() => {
    if (clothingVariants.length > 0 && variantId == null) {
      const available =
        sizesOfColor.find(v => v.stockQty > 0) ?? sizesOfColor[0];
      if (available) {
        setVariantId(available.id);
      }
    }
  }, [clothingVariants.length, sizesOfColor, variantId, clothingVariants]);

  const chosenUnit = product.units.find(u => u.id === unitId);
  const unitPrice = chosenVariant
    ? variantPrice(product, chosenVariant)
    : linePrice(product, unitId);
  const qty = Number(quantity.replace(',', '.')) || 0;
  const stock = availableStock(product, unitId, variantId);
  const isWeight = product.byWeight && !chosenUnit && !chosenVariant;

  return (
    <Sheet visible onClose={onClose} title={product.name}>
      <View style={styles.metaRow}>
        {product.discountPct > 0 ? (
          <Badge label={`خصم المنتج ${product.discountPct}%`} tone="accent" />
        ) : null}
        <Badge label={product.categoryName} tone="neutral" />
        {!product.stockUntracked ? (
          <Badge
            label={`المخزون ${formatQty(stock)}`}
            tone={stock > 0 ? 'info' : 'danger'}
          />
        ) : (
          <Badge label="بلا تتبع مخزون" tone="neutral" />
        )}
      </View>

      {/* أحجام بسعر (مطعم/كافيتريا) */}
      {sizeVariants.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>اختر الحجم</Text>
          <View style={styles.chipRow}>
            {sizeVariants.map(v => (
              <Pressable
                key={v.id}
                style={[
                  styles.chip,
                  variantId === v.id ? styles.chipActive : null,
                ]}
                onPress={() => setVariantId(v.id)}>
                <Text
                  style={[
                    styles.chipText,
                    variantId === v.id ? {color: c.accent} : null,
                  ]}>
                  {v.size}
                </Text>
                <Text style={styles.chipPrice}>
                  {formatMoney(variantPrice(product, v))}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* ملابس: لون ثم مقاس */}
      {clothingVariants.length > 0 ? (
        <>
          <View style={styles.group}>
            <Text style={styles.groupTitle}>اللون</Text>
            <View style={styles.chipRow}>
              {colors.map(name => (
                <Pressable
                  key={name}
                  style={[
                    styles.chip,
                    color === name ? styles.chipActive : null,
                  ]}
                  onPress={() => {
                    setColor(name);
                    setVariantId(null);
                  }}>
                  <Text
                    style={[
                      styles.chipText,
                      color === name ? {color: c.accent} : null,
                    ]}>
                    {name || '—'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.group}>
            <Text style={styles.groupTitle}>المقاس</Text>
            <View style={styles.chipRow}>
              {sizesOfColor.map(v => (
                <Pressable
                  key={v.id}
                  style={[
                    styles.chip,
                    variantId === v.id ? styles.chipActive : null,
                    v.stockQty <= 0 ? styles.chipOut : null,
                  ]}
                  onPress={() => setVariantId(v.id)}>
                  <Text
                    style={[
                      styles.chipText,
                      variantId === v.id ? {color: c.accent} : null,
                    ]}>
                    {v.size || '—'}
                  </Text>
                  <Text style={styles.chipPrice}>
                    {v.stockQty > 0 ? `متاح ${formatQty(v.stockQty)}` : 'نفد'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </>
      ) : null}

      {/* الوحدات (حبة/علبة/غرام…) */}
      {product.units.length > 0 && !chosenVariant ? (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>وحدة البيع</Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, unitId == null ? styles.chipActive : null]}
              onPress={() => setUnitId(null)}>
              <Text
                style={[
                  styles.chipText,
                  unitId == null ? {color: c.accent} : null,
                ]}>
                حبة
              </Text>
              <Text style={styles.chipPrice}>{formatMoney(product.retailPrice)}</Text>
            </Pressable>
            {product.units.map(unit => (
              <Pressable
                key={unit.id}
                style={[
                  styles.chip,
                  unitId === unit.id ? styles.chipActive : null,
                ]}
                onPress={() => setUnitId(unit.id)}>
                <Text
                  style={[
                    styles.chipText,
                    unitId === unit.id ? {color: c.accent} : null,
                  ]}>
                  {unit.name}
                </Text>
                <Text style={styles.chipPrice}>
                  {formatMoney(
                    unit.retailPrice ?? product.retailPrice * unit.conversion,
                  )}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* الكمية / الوزن */}
      <Field
        label={`الكمية (${chosenVariant ? 'قطعة' : chosenUnit ? chosenUnit.name : isWeight ? 'كيلو' : 'حبة'})`}
        value={quantity}
        onChangeText={setQuantity}
        numeric
      />
      {isWeight ? (
        <View style={styles.chipRow}>
          {[0.25, 0.5, 1, 1.5, 2].map(w => (
            <Pressable
              key={String(w)}
              style={[styles.chip, Number(quantity) === w ? styles.chipActive : null]}
              onPress={() => setQuantity(String(w))}>
              <Text style={styles.chipText}>{w} كغ</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {qty > 0 ? (
        <Text style={styles.totalLine}>
          {formatQty(qty)} × {formatMoney(unitPrice)} ={' '}
          {formatMoney(unitPrice * qty)}
        </Text>
      ) : null}

      <AppButton
        title={
          qty > 0 ? `أضف للسلة · ${formatMoney(unitPrice * qty)}` : 'أضف للسلة'
        }
        icon="plus"
        onPress={() => {
          if (qty <= 0) {
            return;
          }
          onAdd(unitId, qty, variantId);
          onClose();
        }}
        disabled={qty <= 0}
      />
    </Sheet>
  );
}

// ── اختيار زبون الدين ────────────────────────────────────────────
function CustomerPickerSheet({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (customer: LocalCustomer) => void;
}) {
  const toast = useToastStore(s => s.show);
  const c = useThemeColors();
  const styles = useCustomerStyles();
  const [customers, setCustomers] = useState<LocalCustomer[] | null>(null);

  useEffect(() => {
    void (async () => {
      let list: LocalCustomer[] = [];
      try {
        const payload = await CashierApi.customers();
        list = payload.customers ?? [];
      } catch {
        list = await loadCachedCustomers();
        if (list.length > 0) {
          toast('قائمة الزبائن من النسخة المخزنة (لا اتصال)', 'info');
        }
      }
      setCustomers(list);
    })();
  }, [toast]);

  return (
    <Sheet visible onClose={onClose} title="بيع بالدين — اختر الزبون">
      <Text style={styles.dim}>
        يُسجَّل الدين في دفتر المتجر داخل نقطة البيع باسمك — حتى دون اتصال،
        ويزامَن أول عودة للشبكة.
      </Text>
      {customers == null ? (
        <ActivityIndicator color={c.accent} />
      ) : customers.length === 0 ? (
        <EmptyState
          icon="book"
          title="لا زبائن في الدفتر"
          subtitle="أضف الزبون من شاشة «ديون المتجر» في نقطة البيع أولاً"
        />
      ) : (
        <ScrollView style={{maxHeight: 340}} contentContainerStyle={{gap: 8}}>
          {customers.map(customer => (
            <Pressable
              key={customer.id}
              style={styles.row}
              onPress={() => {
                onPick(customer);
                onClose();
              }}>
              <View style={{flex: 1}}>
                <Text style={styles.name}>{customer.name}</Text>
                <Text style={styles.dim}>
                  {customer.idNumber}
                  {customer.phone ? ` · ${customer.phone}` : ''}
                </Text>
              </View>
              {customer.outstandingMinor > 0 ? (
                <Badge
                  label={`عليه ${formatMoney(customer.outstandingMinor / 100)}`}
                  tone="warning"
                />
              ) : (
                <Badge label="مسدَّد" tone="success" />
              )}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

// ── الشاشة الرئيسية ───────────────────────────────────────────────
export function SellScreen() {
  const c = useThemeColors();
  const styles = useStyles();
  const toast = useToastStore(s => s.show);
  const products = useCatalogStore(s => s.products);
  const loading = useCatalogStore(s => s.loading);
  const hydrate = useCatalogStore(s => s.hydrate);
  const refreshCatalog = useCatalogStore(s => s.refresh);
  const cart = useCartStore();
  const perms = useSessionStore(s => s.perms);
  const deviceId = useSessionStore(s => s.deviceId);
  const cashierName = useSessionStore(s => s.cashierName);
  const online = useSyncStore(s => s.online);
  const pending = useSyncStore(s => s.pending);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<number | 'all'>('all');
  const [sellProduct, setSellProduct] = useState<CatalogProduct | null>(null);
  const [customerPicker, setCustomerPicker] = useState(false);
  const [discountText, setDiscountText] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<{
    number: string;
    total: number;
    pendingSync: boolean;
  } | null>(null);
  const searchRef = useRef<TextInput | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

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

  // بحث الباركود: تطابق شبه كامل → أضف مباشرة.
  useEffect(() => {
    const query = search.trim();
    if (query.length < 4) {
      return;
    }
    const exact = products.find(
      p =>
        p.barcode === query ||
        p.units.some(u => u.barcode === query),
    );
    if (exact && exact.hasVariants) {
      setSellProduct(exact);
      setSearch('');
      return;
    }
    if (exact) {
      if (exact.units.length > 0 || exact.byWeight) {
        setSellProduct(exact);
      } else {
        cart.add(exact, null, 1);
      }
      setSearch('');
      toast(`أُضيف «${exact.name}» بالباركود`, 'success');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, products]);

  const tryAdd = useCallback(
    (product: CatalogProduct) => {
      if (product.units.length > 0 || product.hasVariants || product.byWeight) {
        setSellProduct(product);
        return;
      }
      cart.add(product, null, 1);
    },
    [cart],
  );

  const maxDiscountMoney = useMemo(
    () => (cart.subtotal() * perms.maxDiscountPct) / 100,
    [cart, perms.maxDiscountPct],
  );

  const completeSaleInner = useCallback(
    async (paymentType: 'cash' | 'debt', customerId?: number) => {
      const createdAt = localTimestamp();
      const clientRef = newClientRef(deviceId || 'dev');
      const lines = cart.lines.map(line => ({
        productId: line.product.id,
        unitId: line.unitId,
        variantId: line.variantId,
        quantity: line.quantity,
      }));
      const subtotal = cart.subtotal();
      const discount = Math.min(
        Math.max(0, cart.discount),
        (subtotal * perms.maxDiscountPct) / 100,
      );
      const total = Math.max(0, subtotal - discount);
      const customerName =
        paymentType === 'debt'
          ? (customerId != null ? 'زبون الدفتر' : '')
          : null;

      // ① محاولة الإرسال المباشر (وأنت متصل).
      if (online) {
        try {
          const payload = await CashierApi.sale({
            lines,
            discount,
            paymentType,
            localCustomerId: customerId,
            clientRef,
            createdAt,
          });
          setLastInvoice({
            number: payload.invoice.number,
            total: payload.invoice.total,
            pendingSync: false,
          });
          cart.clear();
          setDiscountText('');
          void refreshCatalog();
          toast(
            `تم البيع — فاتورة ${payload.invoice.number}`,
            'success',
          );
          return;
        } catch (error) {
          const status =
            error != null &&
            typeof error === 'object' &&
            'status' in error &&
            typeof (error as {status?: number}).status === 'number'
              ? (error as {status: number}).status
              : 0;
          // أخطاء صلاحيات/مخزون حقيقية من الخادم → لا تسجيل محلي.
          if (status >= 400) {
            toast(
              error instanceof Error ? error.message : 'فشل البيع',
              'error',
            );
            return;
          }
          // الشبكة انقطعت (status 0) → نكمل محلياً (المسار الأهم).
          toast('لا اتصال — سُجِّلت الفاتورة محلياً وتزامن تلقائياً', 'info');
        }
      }

      // ② التسجيل المحلي الكامل (بيع دون اتصال).
      try {
        const displayNumber = await nextLocalNumber();
        await recordLocalOp({
          ref: clientRef,
          kind: 'sale',
          displayNumber,
          payKind: paymentType,
          total,
          discount,
          customerName,
          createdAt,
          lines: cart.lines.map(line => ({
            productId: line.product.id,
            name: line.product.name,
            variantId: line.variantId,
            variantLabel: line.variantLabel,
            unitId: line.unitId,
            unitName: line.unitName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.unitPrice * line.quantity,
          })),
          payload: {
            lines,
            discount,
            paymentType,
            localCustomerId: customerId,
            clientRef,
            createdAt,
          },
        });
        setLastInvoice({
          number: displayNumber,
          total,
          pendingSync: true,
        });
        cart.clear();
        setDiscountText('');
        kickSync();
        toast(`سُجِّلت الفاتورة ${displayNumber} — بانتظار المزامنة`, 'success');
      } catch (error) {
        toast(
          error instanceof Error ? error.message : 'تعذر تسجيل الفاتورة محلياً',
          'error',
        );
      }
    },
    [cart, deviceId, online, perms.maxDiscountPct, refreshCatalog, toast],
  );

  const completeSale = useCallback(
    async (paymentType: 'cash' | 'debt', customerId?: number) => {
      if (cart.lines.length === 0) {
        return;
      }
      setBusy(true);
      try {
        await completeSaleInner(paymentType, customerId);
      } finally {
        setBusy(false);
      }
    },
    [completeSaleInner],
  );


  return (
    <View style={styles.screen}>
      {/* البحث بزر المسح + زر التحديث */}
      <View style={styles.searchRow}>
        <View style={{flex: 1}}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="ابحث بالاسم أو امسح الباركود…"
          />
        </View>
        <Pressable
          style={styles.refreshBtn}
          onPress={() => void refreshCatalog()}>
          <Icon
            name="refresh"
            size={18}
            color={loading ? c.textFaint : c.accent}
          />
        </Pressable>
      </View>

      {/* التصنيفات */}
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
                category === 'all' ? {color: c.accent} : null,
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
                  category === item.id ? {color: c.accent} : null,
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
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refreshCatalog()}
          />
        }
        renderItem={({item}) => {
          const out =
            !item.stockUntracked &&
            availableStock(item, null, null) <= 0 &&
            item.variants.every(v => v.stockQty <= 0);
          return (
            <Pressable
              style={({pressed}) => [
                styles.tile,
                pressed ? {opacity: 0.85, transform: [{scale: 0.98}]} : null,
              ]}
              onPress={() => tryAdd(item)}>
              <ProductThumb product={item} />
              <Text style={styles.tileName} numberOfLines={2}>
                {String(item.name ?? '')}
              </Text>
              <Text style={styles.tilePrice}>
                {formatMoney(
                  item.hasVariants && item.variants.length > 0
                    ? variantPrice(
                        item,
                        item.variants[0],
                      )
                    : linePrice(item, null),
                )}
                {item.hasVariants && item.variants.length > 0 ? '+' : ''}
              </Text>
              {item.units.length > 0 ? (
                <Text style={styles.tileUnits} numberOfLines={1}>
                  {item.units.map(u => u.short).join(' · ')}
                </Text>
              ) : null}
              {item.discountPct > 0 && !item.hasVariants ? (
                <View style={styles.tileBadge}>
                  <Text style={styles.tileBadgeText}>-{item.discountPct}%</Text>
                </View>
              ) : null}
              {out ? (
                <View style={styles.tileOut}>
                  <Text style={styles.tileOutText}>نفد</Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="box"
              title="لا منتجات"
              subtitle={
                products.length === 0
                  ? 'اسحب للتحديث أو انتظر مزامنة الكتالوج من نقطة البيع'
                  : 'لا نتائج مطابقة لهذا البحث أو التصنيف'
              }
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
            <Pressable onPress={() => cart.clear()} hitSlop={8}>
              <Text style={styles.cartClear}>تفريغ</Text>
            </Pressable>
          </View>
          <ScrollView style={{maxHeight: 140}} contentContainerStyle={{gap: 6}}>
            {cart.lines.map(line => (
              <View key={line.key} style={styles.cartRow}>
                <View style={{flex: 1}}>
                  <Text style={styles.cartLineName} numberOfLines={1}>
                    {line.product.name}
                    {line.variantLabel ? ` (${line.variantLabel})` : ''}
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
                    onPress={() =>
                      cart.setQuantity(line.key, line.quantity + 1)
                    }>
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>
                    {formatQty(line.quantity)}
                  </Text>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() =>
                      cart.setQuantity(line.key, line.quantity - 1)
                    }>
                    <Text style={styles.qtyBtnText}>−</Text>
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
                const value = Number(text.replace(',', '.')) || 0;
                cart.setDiscount(Math.min(value, maxDiscountMoney));
              }}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={c.textFaint}
            />
            {perms.maxDiscountPct > 0 ? (
              <Text style={styles.discountCap}>حتى {formatMoney(maxDiscountMoney)}</Text>
            ) : null}
            <Text style={styles.totalText}>{formatMoney(cart.total())}</Text>
          </View>
          <View style={styles.checkoutRow}>
            <AppButton
              title="بيع نقدي"
              variant="success"
              icon="cart"
              style={{flex: 1}}
              onPress={() => void completeSale('cash')}
              loading={busy && online}
              disabled={busy && online}
            />
            {perms.canDebt ? (
              <AppButton
                title="بيع بالدين"
                variant="secondary"
                icon="book"
                style={{flex: 1}}
                onPress={() => setCustomerPicker(true)}
                disabled={busy}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {/* نجاح الفاتورة */}
      {lastInvoice ? (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => setLastInvoice(null)}>
          <Pressable
            style={styles.invoiceBackdrop}
            onPress={() => setLastInvoice(null)}>
            <View style={styles.invoiceCard}>
              <View style={styles.invoiceCheckChip}>
                <Icon name="check" size={30} color={c.success} />
              </View>
              <Text style={styles.invoiceNumber}>{lastInvoice.number}</Text>
              <Text style={styles.invoiceTotal}>
                {formatMoney(lastInvoice.total)}
              </Text>
              {lastInvoice.pendingSync ? (
                <View style={{alignItems: 'center', gap: 6}}>
                  <Badge label="بانتظار المزامنة" tone="warning" />
                  <Text style={styles.invoiceHint}>
                    سُجِّلت على جهازك ({cashierName}) — تُرفع لنقطة البيع
                    باسمك فور عودة الاتصال، وساعتها يصدر رقمها الرسمي
                    تلقائياً دون أي تعارض مع بقية الكاشيرين.
                  </Text>
                </View>
              ) : (
                <Text style={styles.invoiceHint}>
                  سُجِّلت في نقطة البيع باسمك — الخزينة والمخزون والديون
                  تحدّثت فوراً.
                </Text>
              )}
            </View>
          </Pressable>
        </Modal>
      ) : null}

      {sellProduct ? (
        <SellProductSheet
          product={sellProduct}
          onClose={() => setSellProduct(null)}
          onAdd={(unitId, quantity, variantId) =>
            cart.add(sellProduct, unitId, quantity, variantId)
          }
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

// ── الأنماط ──────────────────────────────────────────────────────
const useSheetStyles = makeStyles(c =>
  ({
    metaRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
    group: {gap: 8},
    groupTitle: {
      color: c.textDim,
      fontFamily: fonts.bold,
      fontSize: typography.small,
      textAlign: 'right',
    },
    chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
    chip: {
      backgroundColor: c.surfaceHi,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 13,
      paddingVertical: 8,
      gap: 2,
      alignItems: 'center',
    },
    chipActive: {borderColor: c.accent},
    chipOut: {opacity: 0.45},
    chipText: {
      color: c.textDim,
      fontFamily: fonts.bold,
      fontSize: typography.small,
    },
    chipPrice: {
      color: c.textFaint,
      fontFamily: fonts.regular,
      fontSize: typography.micro + 1,
    },
    totalLine: {
      color: c.accent,
      fontFamily: fonts.black,
      fontSize: typography.body,
      textAlign: 'right',
    },
  }) as const,
);

const useCustomerStyles = makeStyles(c =>
  ({
    dim: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.small,
      textAlign: 'right',
      lineHeight: 19,
    },
    row: {
      backgroundColor: c.surfaceHi,
      borderRadius: 12,
      padding: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    name: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.body,
      textAlign: 'right',
    },
  }) as const,
);

const useStyles = makeStyles(c =>
  ({
    screen: {flex: 1, backgroundColor: c.bg},
    searchRow: {
      flexDirection: 'row',
      gap: 8,
      padding: 8,
      paddingBottom: 4,
      alignItems: 'center',
    },
    refreshBtn: {
      width: 46,
      height: 46,
      borderRadius: 13,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catsRow: {gap: 6, paddingHorizontal: 8, paddingBottom: 8},
    catChip: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    catChipActive: {borderColor: c.accent, backgroundColor: c.accentSofter},
    catText: {
      color: c.textDim,
      fontFamily: fonts.medium,
      fontSize: typography.small,
    },
    tile: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.borderSoft,
      padding: 8,
      gap: 4,
    },
    tileName: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.small,
      textAlign: 'center',
      minHeight: 30,
    },
    tilePrice: {
      color: c.accent,
      fontFamily: fonts.black,
      fontSize: typography.body,
      textAlign: 'center',
    },
    tileUnits: {
      color: c.textFaint,
      fontFamily: fonts.regular,
      fontSize: typography.micro,
      textAlign: 'center',
    },
    tileBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      backgroundColor: c.accentSoft,
      borderRadius: 7,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    tileBadgeText: {
      color: c.accent,
      fontFamily: fonts.bold,
      fontSize: typography.micro,
    },
    tileOut: {
      position: 'absolute',
      top: 6,
      left: 6,
      backgroundColor: c.dangerSoft,
      borderRadius: 7,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    tileOutText: {
      color: c.danger,
      fontFamily: fonts.bold,
      fontSize: typography.micro,
    },
    cartPanel: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.md,
      gap: 8,
    },
    cartHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cartTitle: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.body,
      textAlign: 'right',
    },
    cartClear: {
      color: c.danger,
      fontFamily: fonts.medium,
      fontSize: typography.small,
    },
    cartRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surfaceAlt,
      borderRadius: 10,
      padding: 8,
    },
    cartLineName: {
      color: c.text,
      fontFamily: fonts.medium,
      fontSize: typography.small,
      textAlign: 'right',
    },
    cartLineMeta: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.micro + 1,
      textAlign: 'right',
    },
    qtyRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
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
    qtyBtnText: {color: c.text, fontSize: 17, fontFamily: fonts.bold},
    qtyValue: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.body,
      minWidth: 34,
      textAlign: 'center',
    },
    discountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    discountLabel: {
      color: c.textDim,
      fontFamily: fonts.medium,
      fontSize: typography.small,
    },
    discountCap: {
      color: c.textFaint,
      fontFamily: fonts.regular,
      fontSize: typography.micro,
    },
    discountInput: {
      flex: 1,
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      color: c.text,
      fontFamily: fonts.regular,
      paddingHorizontal: 10,
      paddingVertical: 7,
      textAlign: 'center',
    },
    totalText: {
      color: c.accent,
      fontFamily: fonts.black,
      fontSize: typography.heading,
    },
    checkoutRow: {flexDirection: 'row', gap: 8},
    invoiceBackdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    invoiceCard: {
      backgroundColor: c.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.successSoft,
      padding: spacing.xl,
      alignItems: 'center',
      gap: 8,
      width: '100%',
      maxWidth: 360,
    },
    invoiceCheckChip: {
      width: 62,
      height: 62,
      borderRadius: 20,
      backgroundColor: c.successSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    invoiceNumber: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.body,
    },
    invoiceTotal: {
      color: c.accent,
      fontFamily: fonts.black,
      fontSize: typography.title,
    },
    invoiceHint: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.small,
      textAlign: 'center',
      lineHeight: 19,
    },
  }) as const,
);
