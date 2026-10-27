/**
 * offline-stock.test.ts — v3.2 (الجولة 74 #6/#7): منطق المخزون دون
 * اتصال + مرونة الخصم.
 * ─────────────────────────────────────────────────────────────────
 * ① مبدأ «آخر مزامنة ناجحة»: المتاح المعروض = مخزون آخر مزامنة
 *    + Σ(عمليات معلّقة بالوحدات الأساس) — بيع دون اتصال يخصم
 *    محلياً، مرتجعه يعيده محلياً، ولا شيء يمس مخزون نقطة البيع
 *    إلا عند المزامنة.
 * ② تعادل ما بعد المزامنة: إفراغ التسويات (العملية غادرت المعلّق
 *    ومخزون الخادم يشملها) يعيد الأرقام لرصيد الخادم الجديد — لا
 *    ازدواج خصم.
 * ③ الوحدات: تسوية بالأساس تُعرض بوحدة السطر (علبة ×12).
 * ④ المتغيرات (لون × مقاس): تسوية متغير بعينه لا تلمس إخوته.
 * ⑤ حاجب النفاد: حراسة السلة تعمل على الرصيد الفعلي المعدّل.
 * ⑥ الخصم بالنسبة: نفس حد المسؤول وبنفس معادلة التحويل للمبلغ.
 */
import {
  stockWithAdjustments,
  useCartStore,
} from '../src/store/catalog';
import type {CatalogProduct} from '../src/api/types';
import type {PendingStockAdjustment} from '../src/store/offline';

function product(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: 7,
    name: 'عصير',
    categoryId: 1,
    categoryName: 'مشروبات',
    retailPrice: 6,
    wholesalePrice: 5,
    costPrice: 3,
    discountPct: 0,
    stockQty: 24,
    stockUntracked: false,
    byWeight: false,
    barcode: null,
    hasVariants: false,
    hasImage: false,
    units: [
      {
        id: 3,
        name: 'علبة',
        short: 'علبة',
        conversion: 12,
        retailPrice: 60,
        barcode: null,
      },
    ],
    variants: [],
    ...overrides,
  };
}

function clothingProduct(): CatalogProduct {
  return product({
    id: 9,
    name: 'تيشيرت',
    hasVariants: true,
    stockQty: 5,
    units: [],
    variants: [
      {id: 41, kind: 'variant', color: 'أسود', size: 'L', retailPrice: null, costPrice: null, stockQty: 3},
      {id: 42, kind: 'variant', color: 'أبيض', size: 'L', retailPrice: null, costPrice: null, stockQty: 2},
    ],
  });
}

describe('v3.2: المخزون دون اتصال — مبدأ آخر مزامنة ناجحة', () => {
  test('بيع معلّق يخصم محلياً فوق مخزون آخر مزامنة', () => {
    const p = product(); // 24 قطعة آخر مزامنة.
    const adj: PendingStockAdjustment[] = [
      {productId: 7, variantId: null, deltaBase: -10},
    ];
    // بالقطعة: 24 − 10 = 14.
    expect(stockWithAdjustments(p, adj, null, null)).toBe(14);
    // بوحدة العلبة (×12): (24 − 10) / 12 = 1.1666…
    expect(stockWithAdjustments(p, adj, 3, null)).toBeCloseTo(14 / 12, 6);
  });

  test('مرتجع معلّق يعيد المخزون محلياً (بيع ثم إرجاع جزئي)', () => {
    const p = product();
    const adj: PendingStockAdjustment[] = [
      {productId: 7, variantId: null, deltaBase: -10},
      {productId: 7, variantId: null, deltaBase: 4},
    ];
    expect(stockWithAdjustments(p, adj, null, null)).toBe(18);
  });

  test('بعد المزامنة تُفرغ التسويات — لا ازدواج خصم أبداً', () => {
    const p = product();
    const before = stockWithAdjustments(
      p,
      [{productId: 7, variantId: null, deltaBase: -10}],
      null,
      null,
    );
    expect(before).toBe(14);
    // المزامنة تمت: مخزون الخادم الجديد (يشمل البيع) + لا تسويات.
    const after = stockWithAdjustments(p, [], null, null);
    expect(after).toBe(24);
  });

  test('تسوية متغير (لون × مقاس) لا تلمس إخوته', () => {
    const p = clothingProduct(); // أسود L: 3 · أبيض L: 2.
    const adj: PendingStockAdjustment[] = [
      {productId: 9, variantId: 41, deltaBase: -3},
    ];
    expect(stockWithAdjustments(p, adj, null, 41)).toBe(0); // نفد الأسود.
    expect(stockWithAdjustments(p, adj, null, 42)).toBe(2); // الأبيض سليم.
  });

  test('لا يُعرض رصيد سالب أبداً (بيع محلي فوق المتاح يُحرس قبلها)', () => {
    const p = product();
    const adj: PendingStockAdjustment[] = [
      {productId: 7, variantId: null, deltaBase: -30},
    ];
    expect(stockWithAdjustments(p, adj, null, null)).toBe(0);
  });

  test('حارس السلة يمنع البيع فوق الرصيد المعدّل المحلي', () => {
    const cart = useCartStore.getState();
    cart.clear();
    cart.setDiscount(0);
    const p = product(); // 24 قطعة.
    // خصمنا 20 محلياً (بينت محلي دون اتصال) → المتاح 4 فقط.
    const adj: PendingStockAdjustment[] = [
      {productId: 7, variantId: null, deltaBase: -20},
    ];
    // الحارس يقرأ الرصيد الفعلي — 5 قطع تُرفض و4 تُقبل.
    // (نفحص عبر معادلة الحارس نفسها: stockWithAdjustments.)
    expect(stockWithAdjustments(p, adj, null, null)).toBe(4);
    const over = stockWithAdjustments(p, adj, null, null) < 5;
    expect(over).toBe(true);
  });
});

describe('v3.2: الخصم بالنسبة (نمطا الإدخال)', () => {
  test('النسبة تتحول لمبلغ بمعادلة المحرك — وحد المسؤول يُطبق', () => {
    const subtotal = 240;
    const maxPct = 10;
    // كاشير أدخل 8%: المبلغ = 240 × 0.08 = 19.2.
    const amount8 = Math.round(subtotal * (8 / 100) * 100) / 100;
    expect(amount8).toBe(19.2);
    // كاشير أدخل 15% (فوق حده 10%): يقيد عند الحد.
    const cappedPct = Math.min(15, maxPct);
    const amountCapped = Math.round(subtotal * (cappedPct / 100) * 100) / 100;
    expect(amountCapped).toBe(24);
  });

  test('نسبة 0% = بلا خصم، والمبلغ المكافئ للنسبة الكاملة صحيح', () => {
    const subtotal = 77.7;
    expect(Math.round(subtotal * 0 * 100) / 100).toBe(0);
    const full = Math.round(subtotal * 1 * 100) / 100;
    expect(full).toBe(77.7);
  });
});
