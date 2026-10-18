/**
 * screens/SellScreen.tsx — v3.0: البيع بهوية نقطة البيع أندرويد حرفياً.
 * ─────────────────────────────────────────────────────────────────
 * طلب التاجر: «ركّز جيداً في تصميم تطبيق الكاشير كما هو في هوية
 * تطبيق نقطة البيع أندرويد — لن نعيد اختراع العجلة». هذه الشاشة
 * منقولة من PosScreen بنقطة البيع:
 *
 * ① زر مسح الباركود بجانب البحث (على اليمين) — نافذة المسح
 *    الأصلية نفسها؛ الباركود يضيف المنتج مباشرة أو يفتح نافذته.
 * ② بلا تصنيفات (طلب حرفي: «احذفها غير مهمة») — البحث يكفي.
 * ③ ثلاثة أشكال عرض (شبكة/قائمة/بطاقات) — نفس بلاطات نقطة البيع:
 *    صورة فعلية، سعر مخفّض مشطوب، نقطة مخزون ملونة، شارة وزن،
 *    تعتيم النافد ومنع بيعه (نفس حارس مخزون السلة في نقطة البيع).
 * ④ لوحة الوزن: لوحة مفاتيح عشرية مدمجة + أوزان سريعة (وقية/
 *    نصف/كيلو) + وحدات المنتج نفسه — لا كيبورد نظام إطلاقاً.
 * ⑤ نافذة البيع الموحدة: أحجام (مطعم) / لون→مقاس (ملابس) /
 *    وحدات (صيدلية) — نفس تقسيم نقطة البيع.
 * ⑥ السلة بنمط نقطة البيع: رأس بزرَي تكبير/تصغير + شارة عدد +
 *    تفريغ، أسطر مع Stepper وشارة متغير/وحدة، خصم برقائق 5%/10%.
 * ⑦ كل النوافذ INLINE overlay — لا RN Modal بعد النشاط الأصلي
 *    (الماسح) — نفس درس الروم في نقطة البيع.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  I18nManager,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AppButton,
  Badge,
  EmptyState,
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
  sellableNow,
  useCartStore,
  useCatalogStore,
  variantLabel as makeVariantLabel,
  variantPrice,
} from '../store/catalog';
import {useSessionStore} from '../store/session';
import {useAppSettings} from '../store/settings';
import {scanProductBarcode} from '../native';
import {
  loadCachedCustomers,
  nextLocalNumber,
  recordLocalOp,
} from '../store/offline';
import {kickSync, useSyncStore} from '../store/sync';

const WEIGHT_UNIT_NAME = 'كغ';

/** لوحة مفاتيح الوزن العشرية (نفس نقطة البيع — بلا كيبورد نظام). */
const KEYPAD_KEYS: string[][] = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['.', '0', '⌫'],
];

/** الأوزان السريعة الإقليمية (نفس نقطة البيع). */
const QUICK_WEIGHTS: {kg: number; label: string}[] = [
  {kg: 0.25, label: 'وقية'},
  {kg: 0.5, label: 'نصف كغ'},
  {kg: 0.75, label: '٣ أرباع'},
  {kg: 1, label: 'كيلو'},
  {kg: 1.5, label: 'كغ ونص'},
  {kg: 2, label: '٢ كغ'},
];

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_COLUMNS = 3;
const CARD_COLUMNS = 2;
const GRID_GAP = spacing.sm;
const GRID_TILE = Math.floor(
  (SCREEN_WIDTH - spacing.md * 2 - GRID_GAP * (GRID_COLUMNS - 1)) /
    GRID_COLUMNS,
);
const CARD_TILE = Math.floor(
  (SCREEN_WIDTH - spacing.md * 2 - GRID_GAP * (CARD_COLUMNS - 1)) /
    CARD_COLUMNS,
);

/** سعر بلاطة المنتج: أرخص حجم/متغير عند وجودها (+ مؤشر «+»). */
function tilePrice(product: CatalogProduct): {
  label: string;
  plus: boolean;
} {
  if (product.hasVariants && product.variants.length > 0) {
    const prices = product.variants.map(v => variantPrice(product, v));
    return {label: formatMoney(Math.min(...prices)), plus: true};
  }
  return {label: formatMoney(linePrice(product, null)), plus: false};
}

// ── صورة منتج كسولة (بلاطة) ──────────────────────────────────────
function ProductThumb({
  product,
  height = 62,
  big = false,
}: {
  product: CatalogProduct;
  height?: number;
  big?: boolean;
}) {
  const c = useThemeColors();
  // v2.1 — إصلاح الانهيار القاتل: كل الخطافات في أعلى المكون دائماً
  // قبل أي return (درس «Rendered fewer hooks»).
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
        style={{width: '100%', height, borderRadius: 10}}
        resizeMode="cover"
      />
    );
  }
  return (
    <View
      style={[
        useThumbHolderStyles().placeholder,
        {height, borderRadius: 10},
      ]}>
      {product.hasVariants ? (
        <Icon
          name="shapes"
          size={big ? 34 : 20}
          color={c.textFaint}
        />
      ) : (
        <Text
          style={[
            useThumbHolderStyles().glyph,
            {fontSize: big ? 30 : 22},
          ]}>
          {String(product.name ?? '').trim().charAt(0)}
        </Text>
      )}
    </View>
  );
}

const useThumbHolderStyles = makeStyles(c =>
  ({
    placeholder: {
      width: '100%',
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    glyph: {
      color: c.textFaint,
      fontFamily: fonts.black,
    },
  }) as const,
);

// ── لوحة الوزن (INLINE — لا Modal بعد الماسح أبداً) ──────────────
function WeightSheet({
  product,
  onClose,
  onConfirm,
}: {
  product: CatalogProduct | null;
  onClose: () => void;
  onConfirm: (product: CatalogProduct, kg: number) => void;
}) {
  const c = useThemeColors();
  const styles = useWeightSheetStyles();
  const [weightText, setWeightText] = useState('');

  useEffect(() => {
    setWeightText('');
  }, [product?.id]);

  if (product == null) {
    return null;
  }
  const kiloPrice = linePrice(product, null);
  const rawKiloPrice = product.retailPrice;
  const hasDiscount = product.discountPct > 0;
  const weight =
    weightText.length > 0 ? Number(weightText.replace(',', '.')) : NaN;
  const validWeight =
    !Number.isNaN(weight) && weight > 0
      ? Math.round(weight * 1000) / 1000
      : 0;
  const total = validWeight > 0 ? validWeight * kiloPrice : 0;
  const stock = availableStock(product, null, null);

  const pressKey = (key: string) => {
    setWeightText(prev => {
      if (key === '⌫') {
        return prev.length <= 1 ? '' : prev.slice(0, -1);
      }
      if (key === '.') {
        if (prev.includes('.')) {
          return prev;
        }
        return prev === '' ? '0.' : `${prev}.`;
      }
      if (prev.replace('.', '').length >= 6) {
        return prev;
      }
      if (prev === '0') {
        return key;
      }
      return prev + key;
    });
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.dim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.headerRow}>
          <View style={{flex: 1}}>
            <Text style={styles.title} numberOfLines={1}>
              {product.name}
            </Text>
            <Text style={styles.kiloPrice} numberOfLines={1}>
              سعر الكيلو: {formatMoney(kiloPrice)}
              {hasDiscount
                ? ` (خصم ${product.discountPct}% بدلاً من ${formatMoney(rawKiloPrice)})`
                : ''}{' '}
              · المتاح {formatQty(stock)} {WEIGHT_UNIT_NAME}
            </Text>
          </View>
          <Pressable style={styles.clearChip} onPress={() => setWeightText('')}>
            <Text style={styles.clearText}>مسح</Text>
          </Pressable>
        </View>

        <View style={styles.displayRow}>
          <Text
            style={[
              styles.display,
              weightText === '' ? {color: c.textFaint} : null,
            ]}>
            {weightText === '' ? '0' : weightText}
          </Text>
          <Text style={styles.displayUnit}>{WEIGHT_UNIT_NAME}</Text>
          {total > 0 ? (
            <Text style={styles.displayTotal} numberOfLines={1}>
              = {formatMoney(total)}
            </Text>
          ) : null}
        </View>

        <View style={styles.padRow}>
          <View style={styles.keypad}>
            {KEYPAD_KEYS.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.keypadRow}>
                {row.map(key => (
                  <Pressable
                    key={key}
                    style={[
                      styles.keypadKey,
                      key === '⌫' ? styles.keypadKeyDanger : null,
                    ]}
                    onPress={() => pressKey(key)}>
                    <Text style={styles.keypadKeyText}>{key}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
          <View style={styles.quickColumn}>
            {product.units.length > 0 ? (
              <>
                <Text style={styles.quickLabel}>وحدات المنتج</Text>
                {product.units.map(unit => (
                  <Pressable
                    key={unit.id}
                    style={styles.quickChip}
                    onPress={() => {
                      onConfirm(product, unit.conversion);
                      setWeightText('');
                    }}>
                    <Text style={styles.quickValue} numberOfLines={1}>
                      {unit.name}
                    </Text>
                    <Text style={styles.quickName} numberOfLines={1}>
                      {formatQty(unit.conversion)} {WEIGHT_UNIT_NAME} ·{' '}
                      {formatMoney(
                        unit.retailPrice ?? product.retailPrice * unit.conversion,
                      )}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <>
                <Text style={styles.quickLabel}>أوزان سريعة</Text>
                {QUICK_WEIGHTS.map(entry => (
                  <Pressable
                    key={entry.kg}
                    style={styles.quickChip}
                    onPress={() => {
                      onConfirm(product, entry.kg);
                      setWeightText('');
                    }}>
                    <Text style={styles.quickValue}>{formatQty(entry.kg)}</Text>
                    <Text style={styles.quickName}>{entry.label}</Text>
                  </Pressable>
                ))}
              </>
            )}
          </View>
        </View>

        <View style={styles.actionRow}>
          <AppButton
            title="إلغاء"
            variant="secondary"
            onPress={onClose}
            style={{flex: 1}}
          />
          <AppButton
            title={`أضف للسلة${total > 0 ? ` · ${formatMoney(total)}` : ''}`}
            icon="check"
            onPress={() => {
              if (validWeight <= 0) {
                return;
              }
              onConfirm(product, validWeight);
              setWeightText('');
            }}
            disabled={validWeight <= 0}
            style={{flex: 1.8}}
          />
        </View>
      </View>
    </View>
  );
}

// ── نافذة البيع الموحدة (أحجام/ملابس/وحدات) — INLINE ────────────
export function SaleSheet({
  product,
  onClose,
  onAdd,
}: {
  product: CatalogProduct | null;
  onClose: () => void;
  onAdd: (
    product: CatalogProduct,
    unitId: number | null,
    quantity: number,
    variantId: number | null,
  ) => void;
}) {
  const c = useThemeColors();
  const styles = useSaleSheetStyles();
  const [variantId, setVariantId] = useState<number | null>(null);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [color, setColor] = useState('');
  const [quantity, setQuantity] = useState(1);

  const clothingVariants = useMemo(
    () =>
      product?.variants.filter(v => v.kind === 'variant' && v.color) ?? [],
    [product],
  );
  const sizeVariants = useMemo(
    () => product?.variants.filter(v => v.kind === 'size') ?? [],
    [product],
  );
  const colors = useMemo(
    () => Array.from(new Set(clothingVariants.map(v => v.color))),
    [clothingVariants],
  );
  const sizesOfColor = useMemo(
    () => clothingVariants.filter(v => v.color === color),
    [clothingVariants, color],
  );

  useEffect(() => {
    if (product == null) {
      return;
    }
    setVariantId(null);
    setUnitId(null);
    setQuantity(1);
    setColor(colors[0] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  // أول متغير متاح تلقائياً (أول لون+مقاس له رصيد).
  useEffect(() => {
    if (sizeVariants.length > 0 && variantId == null) {
      setVariantId(sizeVariants[0].id);
      return;
    }
    if (clothingVariants.length > 0 && variantId == null) {
      const available =
        sizesOfColor.find(v => v.stockQty > 0) ?? sizesOfColor[0];
      if (available) {
        setVariantId(available.id);
      }
    }
  }, [clothingVariants, sizeVariants, sizesOfColor, variantId]);

  if (product == null) {
    return null;
  }

  const chosenVariant: CatalogVariant | null =
    sizeVariants.length > 0 || clothingVariants.length > 0
      ? product.variants.find(v => v.id === variantId) ?? null
      : null;
  const chosenUnit = product.units.find(u => u.id === unitId);
  const unitPrice = chosenVariant
    ? variantPrice(product, chosenVariant)
    : linePrice(product, unitId);
  const isWeight = product.byWeight && !chosenUnit && !chosenVariant;
  const stock = availableStock(product, unitId, variantId);
  const step = isWeight ? 0.25 : 1;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.dim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.headerRow}>
          <View style={{flex: 1, minWidth: 0}}>
            <Text style={styles.title} numberOfLines={1}>
              {product.name}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {product.discountPct > 0
                ? `خصم ${product.discountPct}% · `
                : ''}
              {product.stockUntracked
                ? 'يُباع دائماً'
                : `المتاح ${formatQty(stock)} ${
                    isWeight
                      ? WEIGHT_UNIT_NAME
                      : chosenUnit
                      ? chosenUnit.name
                      : 'حبة'
                  }`}
            </Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <Icon name="x" size={15} color={c.textDim} />
          </Pressable>
        </View>

        <ScrollView
          style={{flexGrow: 0, maxHeight: 330}}
          contentContainerStyle={{gap: 12}}
          showsVerticalScrollIndicator={false}>
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
                        {v.stockQty > 0
                          ? `متاح ${formatQty(v.stockQty)}`
                          : 'نفد'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          ) : null}

          {/* الوحدات (حبة/علبة/شريط…) */}
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
                  <Text style={styles.chipPrice}>
                    {formatMoney(product.retailPrice)}
                  </Text>
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
                        unit.retailPrice ??
                          product.retailPrice * unit.conversion,
                      )}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* الكمية (Stepper — لا كيبورد نظام) */}
          <View style={styles.group}>
            <Text style={styles.groupTitle}>
              الكمية (
              {chosenVariant
                ? 'قطعة'
                : chosenUnit
                ? chosenUnit.name
                : isWeight
                ? WEIGHT_UNIT_NAME
                : 'حبة'}
              )
            </Text>
            <View style={styles.qtyRow}>
              <Pressable
                style={styles.qtyBtn}
                onPress={() =>
                  setQuantity(q => Math.max(step, Math.round((q - step) * 1000) / 1000))
                }>
                <Icon name="minus" size={15} color={c.text} />
              </Pressable>
              <Text style={styles.qtyValue}>{formatQty(quantity)}</Text>
              <Pressable
                style={styles.qtyBtn}
                onPress={() =>
                  setQuantity(q => Math.round((q + step) * 1000) / 1000)
                }>
                <Icon name="plus" size={15} color={c.text} />
              </Pressable>
              {isWeight ? (
                <View style={styles.miniChips}>
                  {[0.25, 0.5, 1].map(w => (
                    <Pressable
                      key={String(w)}
                      style={[
                        styles.miniChip,
                        quantity === w ? styles.miniChipActive : null,
                      ]}
                      onPress={() => setQuantity(w)}>
                      <Text
                        style={[
                          styles.miniChipText,
                          quantity === w ? {color: c.accent} : null,
                        ]}>
                        {w} كغ
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>

        <AppButton
          title={`أضف للسلة · ${formatMoney(unitPrice * quantity)}`}
          icon="plus"
          onPress={() => {
            onAdd(product, unitId, quantity, variantId);
            onClose();
          }}
          disabled={quantity <= 0}
        />
      </View>
    </View>
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
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.dim} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.headerRow}>
          <View style={{flex: 1}}>
            <Text style={styles.title}>بيع بالدين — اختر الزبون</Text>
            <Text style={styles.sub} numberOfLines={2}>
              يُسجَّل الدين في دفتر المتجر داخل نقطة البيع باسمك — حتى دون
              اتصال، ويزامَن أول عودة للشبكة.
            </Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <Icon name="x" size={15} color={c.textDim} />
          </Pressable>
        </View>
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
                  <Text style={styles.dimText}>
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
      </View>
    </View>
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
  const productView = useAppSettings(s => s.productView);
  const printReceipts = useAppSettings(s => s.printReceipts);

  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [cartMinimized, setCartMinimized] = useState(false);
  const [saleProduct, setSaleProduct] = useState<CatalogProduct | null>(null);
  const [weightProduct, setWeightProduct] = useState<CatalogProduct | null>(
    null,
  );
  const [customerPicker, setCustomerPicker] = useState(false);
  const [discountText, setDiscountText] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<{
    number: string;
    total: number;
    pendingSync: boolean;
    printed: boolean;
  } | null>(null);
  const searchRef = useRef<TextInput | null>(null);
  const prevLinesCountRef = useRef(0);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // إعادة فتح السلة المطوية تلقائياً عند إضافة سطر جديد.
  useEffect(() => {
    if (cart.lines.length > prevLinesCountRef.current) {
      setCartMinimized(false);
    }
    prevLinesCountRef.current = cart.lines.length;
  }, [cart.lines.length]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length === 0) {
      return products;
    }
    return products.filter(product => {
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
  }, [products, search]);

  /**
   * فتح نافذة البيع المناسبة لمود المنتج — نفس تجان نقطة البيع:
   * وزن → لوحة الوزن · متغيرات/أحجام → نافذة البيع · بسيط → إضافة.
   */
  const openSaleSheet = useCallback(
    (product: CatalogProduct) => {
      const sizeVariants = product.variants.filter(v => v.kind === 'size');
      const clothingVariants = product.variants.filter(
        v => v.kind === 'variant',
      );
      if (product.byWeight && product.variants.length === 0) {
        setSaleProduct(null);
        setWeightProduct(product);
        return;
      }
      if (sizeVariants.length > 0 || clothingVariants.length > 0) {
        setWeightProduct(null);
        setSaleProduct(product);
        return;
      }
      if (product.units.length > 0) {
        setWeightProduct(null);
        setSaleProduct(product);
        return;
      }
      // منتج بسيط — إضافة مباشرة (حارس المخزون يحسم).
      const result = cart.add(product, null, 1, null);
      if (!result.ok && result.reason) {
        toast(result.reason, 'error');
      }
    },
    [cart, toast],
  );

  /** إضافة بالباركود (من الماسح أو بحث مطابق تماماً). */
  const addByBarcode = useCallback(
    (code: string) => {
      const query = code.trim();
      if (query.length === 0) {
        return;
      }
      const hit = products.find(
        p =>
          p.barcode === query ||
          p.units.some(u => u.barcode === query),
      );
      if (hit == null) {
        toast(`لا منتج بهذا الباركود (${query})`, 'error');
        return;
      }
      openSaleSheet(hit);
    },
    [products, openSaleSheet, toast],
  );

  // بحث الباركود المطبوع: تطابق شبه كامل → مسار الباركود نفسه.
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
    if (exact) {
      setSearch('');
      addByBarcode(query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, products]);

  /** فتح ماسح الباركود الأصلي (نفس زر نقطة البيع). */
  const openScanner = useCallback(async () => {
    if (scanBusy) {
      return;
    }
    setScanBusy(true);
    try {
      const code = await scanProductBarcode();
      if (code.length > 0) {
        addByBarcode(code);
      }
    } catch {
      // أُلغي المسح — بلا رسالة.
    } finally {
      setScanBusy(false);
    }
  }, [scanBusy, addByBarcode]);

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
          ? customerId != null
            ? 'زبون الدفتر'
            : ''
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
            print: printReceipts,
          });
          setLastInvoice({
            number: payload.invoice.number,
            total: payload.invoice.total,
            pendingSync: false,
            printed: Boolean(payload.printed),
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
          printed: false,
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
    [
      cart,
      deviceId,
      online,
      perms.maxDiscountPct,
      printReceipts,
      refreshCatalog,
      toast,
    ],
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

  const itemsCount = cart.lines.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );

  // ── بلاطة/صف/بطاقة منتج (نفس مكونات نقطة البيع) ──
  const renderProduct = ({item}: {item: CatalogProduct}) => {
    const weighted = item.byWeight && !item.hasVariants;
    const out = !sellableNow(item);
    const price = tilePrice(item);
    const hasDiscount = item.discountPct > 0;
    const rawPrice = item.hasVariants
      ? price.label
      : formatMoney(item.retailPrice);
    const stockLabel = item.stockUntracked
      ? 'يُباع دائماً'
      : out
      ? 'نفد'
      : `${formatQty(item.stockQty)} ${weighted ? WEIGHT_UNIT_NAME : 'حبة'}`;
    const stockColor = out ? c.danger : c.success;

    if (productView === 'list') {
      return (
        <Pressable
          style={[styles.listRow, out ? {opacity: 0.55} : null]}
          onPress={() => openSaleSheet(item)}>
          <View style={{width: 46}}>
            <ProductThumb product={item} height={46} />
          </View>
          <View style={{flex: 1, gap: 2, minWidth: 0}}>
            <Text style={styles.listName} numberOfLines={1}>
              {item.name}
              {item.hasVariants
                ? item.variants[0]?.kind === 'size'
                  ? ` · ${item.variants.length} أحجام`
                  : ` · ${new Set(item.variants.map(v => v.color)).size} لون × ${new Set(item.variants.map(v => v.size)).size} مقاس`
                : ''}
            </Text>
            <View style={styles.listMetaRow}>
              <Text style={styles.listPrice}>
                {hasDiscount ? (
                  <Text>
                    <Text
                      style={{
                        textDecorationLine: 'line-through',
                        color: c.textFaint,
                        fontSize: 11,
                      }}>
                      {rawPrice}
                    </Text>
                    {'  '}
                    {price.label}
                    <Text style={{color: c.danger, fontWeight: '900'}}>
                      {'  -'}
                      {item.discountPct}%
                    </Text>
                  </Text>
                ) : (
                  `${price.label}${price.plus ? '+' : ''}${weighted ? '/كغ' : ''}`
                )}
              </Text>
              {item.stockUntracked ? null : (
                <>
                  <View
                    style={[styles.stockDot, {backgroundColor: stockColor}]}
                  />
                  <Text style={styles.stockText}>{stockLabel}</Text>
                </>
              )}
              {item.barcode ? (
                <Icon name="barcode" size={11} color={c.textFaint} />
              ) : null}
            </View>
          </View>
          {weighted ? (
            <View style={styles.weightBadge}>
              <Icon name="scale" size={9} color={c.onAccent} />
            </View>
          ) : null}
        </Pressable>
      );
    }

    if (productView === 'cards') {
      return (
        <Pressable
          style={[styles.cardTile, {width: CARD_TILE}, out ? {opacity: 0.55} : null]}
          onPress={() => openSaleSheet(item)}>
          <View style={{width: '100%'}}>
            <ProductThumb product={item} height={Math.round(CARD_TILE * 0.72)} big />
          </View>
          {weighted ? (
            <View style={styles.weightBadge}>
              <Icon name="scale" size={9} color={c.onAccent} />
            </View>
          ) : null}
          <Text style={styles.cardName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cardPrice}>
            {hasDiscount ? (
              <Text>
                <Text
                  style={{
                    textDecorationLine: 'line-through',
                    color: c.textFaint,
                    fontSize: 11,
                  }}>
                  {rawPrice}
                </Text>
                {'  '}
                {price.label}
                <Text style={{color: c.danger, fontWeight: '900'}}>
                  {'  -'}
                  {item.discountPct}%
                </Text>
              </Text>
            ) : (
              `${price.label}${price.plus ? '+' : ''}${weighted ? '/كغ' : ''}`
            )}
          </Text>
          <View style={styles.stockRow}>
            {item.stockUntracked ? (
              <Text style={styles.stockText}>{stockLabel}</Text>
            ) : (
              <>
                <View
                  style={[styles.stockDot, {backgroundColor: stockColor}]}
                />
                <Text style={styles.stockText}>{stockLabel}</Text>
              </>
            )}
            {item.barcode ? (
              <Icon name="barcode" size={11} color={c.textFaint} />
            ) : null}
          </View>
        </Pressable>
      );
    }

    // الشبكة الافتراضية — بلاطات نقطة البيع.
    return (
      <Pressable
        style={[styles.tile, {width: GRID_TILE}, out ? {opacity: 0.55} : null]}
        onPress={() => openSaleSheet(item)}>
        <View style={{width: '100%'}}>
          <ProductThumb product={item} height={Math.round(GRID_TILE * 0.58)} />
        </View>
        {weighted ? (
          <View style={styles.weightBadge}>
            <Icon name="scale" size={9} color={c.onAccent} />
          </View>
        ) : null}
        {hasDiscount ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountBadgeText}>-{item.discountPct}%</Text>
          </View>
        ) : null}
        <Text style={styles.tileName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.tilePrice} numberOfLines={1}>
          {hasDiscount ? (
            <Text>
              <Text
                style={{
                  textDecorationLine: 'line-through',
                  color: c.textFaint,
                  fontSize: 10.5,
                }}>
                {rawPrice}
              </Text>
              {'  '}
              {price.label}
              <Text style={{color: c.danger, fontWeight: '900'}}>
                {'  -'}
                {item.discountPct}%
              </Text>
            </Text>
          ) : (
            `${price.label}${price.plus ? '+' : ''}${weighted ? '/كغ' : ''}`
          )}
        </Text>
        <View style={styles.stockRow}>
          {item.stockUntracked ? (
            <Text style={styles.stockText}>{stockLabel}</Text>
          ) : (
            <>
              <View
                style={[styles.stockDot, {backgroundColor: stockColor}]}
              />
              <Text style={styles.stockText}>{stockLabel}</Text>
            </>
          )}
          {item.barcode ? (
            <Icon name="barcode" size={11} color={c.textFaint} />
          ) : null}
        </View>
      </Pressable>
    );
  };

  const cartHidden = searchFocused || cartMinimized;

  return (
    <View style={styles.screen}>
      {/* ── زر المسح + البحث (زر المسح أولاً في RTL → أقصى اليمين) ── */}
      <View style={styles.searchRow}>
        <Pressable
          style={[styles.scanButton, scanBusy ? {opacity: 0.6} : null]}
          onPress={() => void openScanner()}
          disabled={scanBusy}>
          <Icon name="barcode" size={19} color={c.onAccent} />
          <Text style={styles.scanButtonText}>مسح</Text>
        </Pressable>
        <View style={{flex: 1}}>
          <Pressable
            style={[
              styles.searchBox,
              search.length > 0 ? {borderColor: c.accent} : null,
            ]}
            onPress={() => searchRef.current?.focus()}>
            <Icon name="search" size={15} color={c.textFaint} />
            <TextInput
              ref={searchRef}
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="ابحث بالاسم أو الباركود…"
              placeholderTextColor={c.textFaint}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              returnKeyType="search"
            />
            {search.length > 0 ? (
              <Pressable
                onPress={() => setSearch('')}
                hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                <Icon name="x" size={14} color={c.textDim} />
              </Pressable>
            ) : null}
          </Pressable>
        </View>
      </View>

      {/* ── الشبكة (تختفي عند توسيع السلة) ── */}
      {!cartExpanded ? (
        products.length === 0 && !loading ? (
          <EmptyState
            icon="box"
            title="لا منتجات"
            subtitle="اسحب للتحديث أو انتظر مزامنة الكتالوج من نقطة البيع"
          />
        ) : (
          <FlatList
            data={visible}
            keyExtractor={item => `${item.id}-${productView}`}
            numColumns={productView === 'list' ? 1 : productView === 'cards' ? CARD_COLUMNS : GRID_COLUMNS}
            key={productView}
            contentContainerStyle={{
              gap: GRID_GAP,
              paddingHorizontal: spacing.md,
              paddingTop: spacing.sm,
              paddingBottom: 16,
            }}
            columnWrapperStyle={
              productView === 'list'
                ? undefined
                : {gap: GRID_GAP}
            }
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => void refreshCatalog()}
              />
            }
            renderItem={renderProduct}
            ListEmptyComponent={
              !loading ? (
                <View style={{paddingTop: spacing.xl}}>
                  <EmptyState
                    icon="search"
                    title="لا نتائج"
                    subtitle={`لا منتج يطابق «${search}»`}
                  />
                </View>
              ) : null
            }
            style={{flex: 1}}
            keyboardShouldPersistTaps="handled"
          />
        )
      ) : null}

      {/* ── السلة (نمط نقطة البيع) ── */}
      {cartHidden ? (
        cart.lines.length > 0 ? (
          <Pressable
            style={styles.cartPeek}
            onPress={() => {
              setSearchFocused(false);
              setCartMinimized(false);
              searchRef.current?.blur();
            }}>
            <Icon name="cart" size={15} color={c.accent} />
            <Text style={styles.cartPeekText} numberOfLines={1}>
              السلة: {formatQty(itemsCount)} وحدة · {formatMoney(cart.total())}
            </Text>
            <Text style={styles.cartPeekHint}>إظهار السلة</Text>
          </Pressable>
        ) : null
      ) : (
        <View style={cartExpanded ? styles.cartPanelExpanded : styles.cartPanel}>
          {cart.lines.length === 0 ? (
            <Pressable
              style={styles.cartEmptyRow}
              onPress={() =>
                toast(
                  'السلة فارغة — المس منتجاً من الشبكة بالأعلى، أو استخدم زر المسح بجانب البحث',
                  'info',
                )
              }>
              <Icon name="cart" size={18} color={c.textFaint} />
              <Text style={styles.cartEmptyText}>
                السلة فارغة — المس منتجاً من الشبكة أو امسحه بالباركود
              </Text>
            </Pressable>
          ) : (
            <>
              <View style={styles.cartHeaderRow}>
                <View style={styles.cartSizeBtns}>
                  <Pressable
                    style={[
                      styles.cartSizeBtn,
                      cartExpanded ? {borderColor: c.accent} : null,
                    ]}
                    onPress={() => setCartExpanded(value => !value)}
                    hitSlop={{top: 6, bottom: 6, left: 4, right: 4}}>
                    <View
                      style={{
                        transform: [
                          {rotate: cartExpanded ? '0deg' : '180deg'},
                        ],
                      }}>
                      <Icon
                        name="chevronDown"
                        size={15}
                        color={cartExpanded ? c.accent : c.textDim}
                      />
                    </View>
                  </Pressable>
                  <Pressable
                    style={styles.cartSizeBtn}
                    onPress={() => {
                      setCartExpanded(false);
                      setCartMinimized(true);
                    }}
                    hitSlop={{top: 6, bottom: 6, left: 4, right: 4}}>
                    <Icon name="minus" size={15} color={c.textDim} />
                  </Pressable>
                </View>
                <View style={styles.cartHeaderTitle}>
                  <Icon name="cart" size={14} color={c.accent} />
                  <Text style={styles.cartHeaderText}>سلة البيع</Text>
                  <Badge label={String(itemsCount)} tone="neutral" />
                </View>
                <Pressable
                  style={styles.clearCartBtn}
                  onPress={() => {
                    cart.clear();
                    setDiscountText('');
                  }}
                  hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                  <Icon name="trash" size={14} color={c.danger} />
                  <Text style={styles.clearCartText}>تفريغ</Text>
                </Pressable>
              </View>

              <View
                style={
                  cartExpanded ? styles.cartLinesWrapExpanded : styles.cartLinesWrap
                }>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {cart.lines.map(line => (
                    <View key={line.key} style={styles.cartLine}>
                      <View style={styles.cartLineInfo}>
                        <Text style={styles.cartLineName} numberOfLines={1}>
                          {line.product.name}
                        </Text>
                        <View style={styles.cartLineMetaRow}>
                          <Text style={styles.cartLineMeta} numberOfLines={1}>
                            {line.product.discountPct > 0 ? (
                              <Text
                                style={{
                                  textDecorationLine: 'line-through',
                                  color: c.textFaint,
                                  fontSize: 11,
                                }}>
                                {formatMoney(line.product.retailPrice)}
                                {'  '}
                              </Text>
                            ) : null}
                            {formatMoney(line.unitPrice)} ×{' '}
                            {formatQty(line.quantity)} ={' '}
                            {formatMoney(line.unitPrice * line.quantity)}
                          </Text>
                          {line.variantLabel != null ? (
                            <View style={styles.variantChip}>
                              <Icon name="tag" size={10} color={c.accent} />
                              <Text
                                style={styles.variantChipText}
                                numberOfLines={1}>
                                {line.variantLabel}
                              </Text>
                            </View>
                          ) : line.byWeight ? (
                            <View style={styles.variantChip}>
                              <Icon name="scale" size={10} color={c.accent} />
                              <Text style={styles.variantChipText}>وزن</Text>
                            </View>
                          ) : line.unitId != null ? (
                            <View style={styles.variantChip}>
                              <Icon name="scale" size={10} color={c.accent} />
                              <Text
                                style={styles.variantChipText}
                                numberOfLines={1}>
                                {line.unitName}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.stepperRow}>
                        <Pressable
                          style={styles.stepBtn}
                          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                          onPress={() => {
                            const result = cart.setQuantity(
                              line.key,
                              Math.round((line.quantity + 1) * 1000) / 1000,
                            );
                            if (!result.ok && result.reason) {
                              toast(result.reason, 'error');
                            }
                          }}>
                          <Icon name="plus" size={13} color={c.text} />
                        </Pressable>
                        <Text style={styles.stepValue}>
                          {formatQty(line.quantity)}
                        </Text>
                        <Pressable
                          style={styles.stepBtn}
                          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                          onPress={() =>
                            cart.setQuantity(
                              line.key,
                              Math.round((line.quantity - 1) * 1000) / 1000,
                            )
                          }>
                          <Icon name="minus" size={13} color={c.text} />
                        </Pressable>
                      </View>
                      <Pressable
                        onPress={() => cart.removeLine(line.key)}
                        style={styles.removeBtn}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                        <Icon name="trash" size={13} color={c.danger} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.discountRow}>
                <Text style={styles.discountLabel}>خصم (₪)</Text>
                <TextInput
                  style={styles.discountInput}
                  value={discountText}
                  onChangeText={text => {
                    setDiscountText(text);
                    const value = Number(text.replace(',', '.')) || 0;
                    cart.setDiscount(Math.min(value, maxDiscountMoney));
                  }}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={c.textFaint}
                />
                <Pressable
                  style={styles.quickChip}
                  onPress={() => {
                    const next = cart.subtotal() * 0.05;
                    cart.setDiscount(Math.min(next, maxDiscountMoney));
                    setDiscountText(
                      String(
                        Math.round(
                          Math.min(next, maxDiscountMoney) * 100,
                        ) / 100,
                      ),
                    );
                  }}>
                  <Text style={styles.quickChipText}>5%</Text>
                </Pressable>
                <Pressable
                  style={styles.quickChip}
                  onPress={() => {
                    const next = cart.subtotal() * 0.1;
                    cart.setDiscount(Math.min(next, maxDiscountMoney));
                    setDiscountText(
                      String(
                        Math.round(
                          Math.min(next, maxDiscountMoney) * 100,
                        ) / 100,
                      ),
                    );
                  }}>
                  <Text style={styles.quickChipText}>10%</Text>
                </Pressable>
                <Text style={styles.totalText}>{formatMoney(cart.total())}</Text>
              </View>

              <View style={styles.checkoutRow}>
                <AppButton
                  title="بيع نقدي"
                  variant="success"
                  icon="cart"
                  style={{flex: 1.4}}
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
              {pending > 0 ? (
                <Text style={styles.pendingHint}>
                  {pending} عملية بانتظار المزامنة — البيع يعمل محلياً
                </Text>
              ) : null}
            </>
          )}
        </View>
      )}

      {/* نوافذ INLINE فوق كل شيء */}
      {saleProduct ? (
        <SaleSheet
          product={saleProduct}
          onClose={() => setSaleProduct(null)}
          onAdd={(product, unitId, quantity, variantId) => {
            const result = cart.add(product, unitId, quantity, variantId);
            if (!result.ok && result.reason) {
              toast(result.reason, 'error');
            }
          }}
        />
      ) : null}
      {weightProduct ? (
        <WeightSheet
          product={weightProduct}
          onClose={() => setWeightProduct(null)}
          onConfirm={(product, kg) => {
            const result = cart.add(product, null, kg, null);
            if (!result.ok && result.reason) {
              toast(result.reason, 'error');
              return;
            }
            setWeightProduct(null);
          }}
        />
      ) : null}
      {customerPicker ? (
        <CustomerPickerSheet
          onClose={() => setCustomerPicker(false)}
          onPick={customer => void completeSale('debt', customer.id)}
        />
      ) : null}

      {/* نجاح الفاتورة */}
      {lastInvoice ? (
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
            {lastInvoice.printed ? (
              <Badge label="طُبعت من طابعة نقطة البيع" tone="info" />
            ) : null}
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
            <AppButton
              title="فاتورة جديدة"
              icon="plus"
              small
              onPress={() => setLastInvoice(null)}
            />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── الأنماط ──────────────────────────────────────────────────────
const useWeightSheetStyles = makeStyles(c =>
  ({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 40,
      elevation: 40,
      justifyContent: 'flex-end',
    },
    dim: {flex: 1, backgroundColor: c.overlay},
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderWidth: 1,
      borderColor: c.borderSoft,
      padding: spacing.lg,
      gap: spacing.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    title: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.heading,
      textAlign: 'right',
      flexShrink: 1,
    },
    kiloPrice: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.small,
      textAlign: 'right',
    },
    clearChip: {
      backgroundColor: c.surfaceHi,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    clearText: {
      color: c.danger,
      fontFamily: fonts.bold,
      fontSize: typography.small,
    },
    displayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: c.surfaceAlt,
      borderRadius: 14,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
    },
    display: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: 30,
      flexShrink: 1,
    },
    displayUnit: {
      color: c.textDim,
      fontFamily: fonts.bold,
      fontSize: typography.body,
    },
    displayTotal: {
      color: c.accent,
      fontFamily: fonts.black,
      fontSize: typography.body,
      flex: 1,
      textAlign: 'left',
    },
    padRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    keypad: {flex: 1, gap: 7},
    keypadRow: {flexDirection: 'row', gap: 7},
    keypadKey: {
      flex: 1,
      height: 46,
      borderRadius: 12,
      backgroundColor: c.surfaceHi,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keypadKeyDanger: {backgroundColor: c.dangerSoft, borderColor: c.dangerSoft},
    keypadKeyText: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: 19,
    },
    quickColumn: {width: 128, gap: 6},
    quickLabel: {
      color: c.textDim,
      fontFamily: fonts.bold,
      fontSize: typography.micro + 1,
      textAlign: 'right',
    },
    quickChip: {
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 11,
      paddingHorizontal: 10,
      paddingVertical: 7,
      gap: 1,
    },
    quickValue: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.small,
      textAlign: 'right',
    },
    quickName: {
      color: c.textFaint,
      fontFamily: fonts.regular,
      fontSize: typography.micro,
      textAlign: 'right',
    },
    actionRow: {flexDirection: 'row', gap: spacing.sm},
  }) as const,
);

const useSaleSheetStyles = makeStyles(c =>
  ({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 40,
      elevation: 40,
      justifyContent: 'flex-end',
    },
    dim: {flex: 1, backgroundColor: c.overlay},
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderWidth: 1,
      borderColor: c.borderSoft,
      padding: spacing.lg,
      gap: spacing.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    title: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.heading,
      textAlign: 'right',
      flexShrink: 1,
    },
    sub: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.small,
      textAlign: 'right',
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: c.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    qtyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    qtyBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: c.surfaceHi,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qtyValue: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.heading,
      minWidth: 52,
      textAlign: 'center',
    },
    miniChips: {flexDirection: 'row', gap: 6, flex: 1},
    miniChip: {
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    miniChipActive: {borderColor: c.accent},
    miniChipText: {
      color: c.textDim,
      fontFamily: fonts.bold,
      fontSize: typography.micro + 1,
    },
  }) as const,
);

const useCustomerStyles = makeStyles(c =>
  ({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 40,
      elevation: 40,
      justifyContent: 'flex-end',
    },
    dim: {flex: 1, backgroundColor: c.overlay},
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderWidth: 1,
      borderColor: c.borderSoft,
      padding: spacing.lg,
      gap: spacing.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    title: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.heading,
      textAlign: 'right',
      flexShrink: 1,
    },
    sub: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.small,
      textAlign: 'right',
      lineHeight: 19,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: c.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
    },
    row: {
      backgroundColor: c.surfaceAlt,
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
    dimText: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.small,
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
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm + 2,
      paddingBottom: spacing.sm,
      alignItems: 'center',
    },
    scanButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.accent,
      borderRadius: 13,
      paddingHorizontal: 14,
      height: 46,
    },
    scanButtonText: {
      color: c.onAccent,
      fontFamily: fonts.black,
      fontSize: typography.body,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 13,
      height: 46,
      paddingHorizontal: 12,
    },
    searchInput: {
      flex: 1,
      color: c.text,
      fontFamily: fonts.regular,
      fontSize: typography.body,
      padding: 0,
      textAlign: I18nManager.isRTL ? 'right' : 'left',
    },
    // ── بلاطة الشبكة ──
    tile: {
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.borderSoft,
      padding: 7,
      gap: 4,
      alignItems: 'center',
    },
    tileName: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.small,
      textAlign: 'center',
      minHeight: 28,
    },
    tilePrice: {
      color: c.accent,
      fontFamily: fonts.black,
      fontSize: typography.body - 1,
      textAlign: 'center',
    },
    discountBadge: {
      position: 'absolute',
      top: 10,
      left: 10,
      backgroundColor: c.dangerSoft,
      borderRadius: 7,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    discountBadgeText: {
      color: c.danger,
      fontFamily: fonts.bold,
      fontSize: typography.micro,
    },
    weightBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 22,
      height: 22,
      borderRadius: 999,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stockRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    stockDot: {width: 7, height: 7, borderRadius: 999},
    stockText: {
      color: c.textFaint,
      fontFamily: fonts.regular,
      fontSize: typography.micro,
      flexShrink: 1,
    },
    // ── صف القائمة ──
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: c.borderSoft,
      padding: 9,
    },
    listName: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.body - 1,
      textAlign: 'right',
    },
    listMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    listPrice: {
      color: c.accent,
      fontFamily: fonts.black,
      fontSize: typography.small + 1,
    },
    // ── البطاقة الكبيرة ──
    cardTile: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.borderSoft,
      padding: 8,
      gap: 4,
    },
    cardName: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.body - 1,
      textAlign: 'right',
    },
    cardPrice: {
      color: c.accent,
      fontFamily: fonts.black,
      fontSize: typography.body,
      textAlign: 'right',
    },
    // ── السلة ──
    cartPeek: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.borderSoft,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
    },
    cartPeekText: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.body - 1,
      flex: 1,
      flexShrink: 1,
    },
    cartPeekHint: {
      color: c.accent,
      fontFamily: fonts.bold,
      fontSize: typography.small,
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
    cartPanelExpanded: {
      flex: 1,
      backgroundColor: c.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.md,
      gap: 8,
    },
    cartEmptyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 16,
      justifyContent: 'center',
    },
    cartEmptyText: {
      color: c.textFaint,
      fontFamily: fonts.medium,
      fontSize: typography.small,
      flexShrink: 1,
    },
    cartHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cartSizeBtns: {flexDirection: 'row', gap: 6},
    cartSizeBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: c.surfaceHi,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cartHeaderTitle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
      justifyContent: 'center',
    },
    cartHeaderText: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.body,
    },
    clearCartBtn: {flexDirection: 'row', alignItems: 'center', gap: 4},
    clearCartText: {
      color: c.danger,
      fontFamily: fonts.medium,
      fontSize: typography.small,
    },
    cartLinesWrap: {maxHeight: 168},
    cartLinesWrapExpanded: {flex: 1, minHeight: 120},
    cartLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surfaceAlt,
      borderRadius: 11,
      padding: 8,
      marginBottom: 6,
    },
    cartLineInfo: {flex: 1, minWidth: 0, gap: 3},
    cartLineName: {
      color: c.text,
      fontFamily: fonts.medium,
      fontSize: typography.small + 1,
      textAlign: 'right',
    },
    cartLineMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    cartLineMeta: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.micro + 1,
      textAlign: 'right',
      flexShrink: 1,
    },
    variantChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: c.accentSofter,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    variantChipText: {
      color: c.accent,
      fontFamily: fonts.bold,
      fontSize: typography.micro,
    },
    stepperRow: {flexDirection: 'row', alignItems: 'center', gap: 7},
    stepBtn: {
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepValue: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.body,
      minWidth: 40,
      textAlign: 'center',
    },
    removeBtn: {padding: 4},
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
    quickChip: {
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    quickChipText: {
      color: c.accent,
      fontFamily: fonts.bold,
      fontSize: typography.micro + 1,
    },
    totalText: {
      color: c.accent,
      fontFamily: fonts.black,
      fontSize: typography.heading,
    },
    checkoutRow: {flexDirection: 'row', gap: 8},
    pendingHint: {
      color: c.warning,
      fontFamily: fonts.regular,
      fontSize: typography.micro + 1,
      textAlign: 'center',
    },
    invoiceBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      zIndex: 60,
      elevation: 60,
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
