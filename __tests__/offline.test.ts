/**
 * offline.test.ts — v2.0: حرّوس الطبقة الحرجة للعمل دون اتصال.
 * ─────────────────────────────────────────────────────────────────
 * ① تكافؤ التسعير: معادلات الكتالوج المحلي (خصم المنتج، سعر الوحدة
 *    بمشتق التحويل، سعر المتغير/الحجم) تطابق معادلة الخادم حرفياً —
 *    فالفاتورة المحلية تعرض نفس ما سيُسجَّل عند المزامنة.
 * ② تفرد مراجع clientRef (ضمان اللاازدواج عند إعادة المزامنة).
 * ③ تحليل بطاقات QR (sela-cashier://IP:PORT والعنوان المباشر).
 * ④ سلة المتغيرات: مفتاح سطر مستقل لكل متغير + السعر الصحيح.
 */
import {parseQrConnectPayload} from '../src/native';
import {newClientRef} from '../src/api/client';
import {
  availableStock,
  linePrice,
  useCartStore,
  variantPrice,
} from '../src/store/catalog';
import type {CatalogProduct} from '../src/api/types';

/** منتج اختباري بخصم 20% ووحدات (علبة ×12) ومتغيرات ملابس. */
function sampleProduct(): CatalogProduct {
  return {
    id: 7,
    name: 'عصير',
    categoryId: 1,
    categoryName: 'مشروبات',
    retailPrice: 6,
    wholesalePrice: 5,
    costPrice: 3,
    discountPct: 20,
    stockQty: 24,
    stockUntracked: false,
    byWeight: false,
    barcode: '6280000000017',
    hasVariants: false,
    hasImage: false,
    units: [
      {
        id: 3,
        name: 'علبة',
        short: 'علبة',
        conversion: 12,
        retailPrice: 60,
        barcode: '6280000000024',
      },
    ],
    variants: [],
  };
}

function variantProduct(): CatalogProduct {
  return {
    id: 9,
    name: 'تيشيرت',
    categoryId: 2,
    categoryName: 'ملابس',
    retailPrice: 35,
    wholesalePrice: 30,
    costPrice: 15,
    discountPct: 10,
    stockQty: 3,
    stockUntracked: false,
    byWeight: false,
    barcode: null,
    hasVariants: true,
    hasImage: true,
    units: [],
    variants: [
      {id: 11, kind: 'variant', color: 'أسود', size: 'L', retailPrice: null, costPrice: 15, stockQty: 4},
      {id: 12, kind: 'size', color: '', size: 'كبير', retailPrice: 22, costPrice: 9, stockQty: 0},
    ],
  };
}

describe('v2.0 — تكافؤ التسعير المحلي مع الخادم', () => {
  test('سعر الأساس مع خصم المنتج (نفس معادلة LanHandlers)', () => {
    // 6 × (1 - 20/100) = 4.8
    expect(linePrice(sampleProduct(), null)).toBe(4.8);
  });

  test('سعر الوحدة: تجاوز العلبة إن وُجد وإلا المشتق', () => {
    // علبة بسعرها الصريح 60 مع الخصم → 48.
    expect(linePrice(sampleProduct(), 3)).toBe(48);
    // وحدة بلا سعر صريح (نحذفه): 6 × 12 × 0.8 = 57.6.
    const derived = {
      ...sampleProduct(),
      units: [{id: 3, name: 'علبة', short: 'علبة', conversion: 12, retailPrice: null, barcode: null}],
    };
    expect(linePrice(derived, 3)).toBe(57.6);
  });

  test('سعر متغير الملابس (لون×مقاس) بسعر الأساس وخصم المنتج', () => {
    const product = variantProduct();
    // 35 × (1 - 10/100) = 31.5 — نفس toVariantLine.
    expect(variantPrice(product, product.variants[0])).toBe(31.5);
  });

  test('سعر الحجم (مطعم) بسعره الخاص وخصم المنتج', () => {
    const product = variantProduct();
    // 22 × 0.9 = 19.8 — نفس toSizedLine.
    expect(variantPrice(product, product.variants[1])).toBe(19.8);
  });

  test('المخزون المتاح: متغير الملابس بمخزونه والحجم بمخزون المنتج', () => {
    const product = variantProduct();
    expect(availableStock(product, null, 11)).toBe(4);
    expect(availableStock(product, null, 12)).toBe(3);
    // بالوحدة: 24 ÷ 12 = 2 علبة.
    expect(availableStock(sampleProduct(), 3, null)).toBe(2);
  });
});

describe('v2.0 — سلة المتغيرات (إصلاح خطأ منتج متغيرات)', () => {
  beforeEach(() => {
    useCartStore.getState().clear();
  });

  test('كل متغير سطر مستقل بسعره — لا رفض ولا دمج خاطئ', () => {
    const product = variantProduct();
    useCartStore.getState().add(product, null, 2, 11);
    useCartStore.getState().add(product, null, 1, 12);
    const {lines} = useCartStore.getState();
    expect(lines).toHaveLength(2);
    expect(lines[0].unitPrice).toBe(31.5);
    expect(lines[0].variantLabel).toBe('أسود · L');
    expect(lines[1].unitPrice).toBe(19.8);
    expect(lines[1].variantLabel).toBe('كبير');
    // الإجمالي = 2×31.5 + 19.8 = 82.8.
    expect(useCartStore.getState().subtotal()).toBeCloseTo(82.8, 5);
  });

  test('إضافة نفس المتغير مرتين تدمج بالكميات', () => {
    const product = variantProduct();
    useCartStore.getState().add(product, null, 1, 11);
    useCartStore.getState().add(product, null, 2, 11);
    const {lines} = useCartStore.getState();
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(3);
  });

  test('v3.0 — منتج نفد لا يدخل السلة أبداً (نفس قاعدة نقطة البيع)', () => {
    const product = sampleProduct();
    // نفد كلياً.
    const out = {...product, stockQty: 0} as never;
    expect(useCartStore.getState().add(out, null, 1, null).ok).toBe(false);
    expect(useCartStore.getState().lines).toHaveLength(0);
    // المتاح 24: 20 مقبولة، والخمس الإضافية مرفوضة (المتاح 4 فقط).
    expect(useCartStore.getState().add(product, null, 20, null).ok).toBe(true);
    const extra = useCartStore.getState().add(product, null, 5, null);
    expect(extra.ok).toBe(false);
    expect(extra.reason).toContain('المتاح');
    expect(useCartStore.getState().lines).toHaveLength(1);
    // بلا تتبع مخزون — يُباع دائماً.
    useCartStore.getState().clear();
    const untracked = {...product, stockUntracked: true} as never;
    expect(useCartStore.getState().add(untracked, null, 999, null).ok).toBe(
      true,
    );
  });

  test('v3.0 — متغير ملابس نافد مرفوض وربطته محفوظة', () => {
    const product = variantProduct();
    // متغير 11 رصيده 4 — الخامسة مرفوضة برسالة عربية.
    const fifth = useCartStore.getState().add(product, null, 5, 11);
    expect(fifth.ok).toBe(false);
    expect(fifth.reason).toContain('المتاح');
    expect(useCartStore.getState().lines).toHaveLength(0);
    // أربع قطع مقبولة تماماً.
    expect(useCartStore.getState().add(product, null, 4, 11).ok).toBe(true);
  });
});

describe('v2.0 — مراجع العملية وبطاقة QR', () => {
  test('clientRef فريد دائماً على نفس الجهاز', () => {
    const refs = new Set<string>();
    for (let i = 0; i < 300; i += 1) {
      refs.add(newClientRef('cashier-abc'));
    }
    expect(refs.size).toBe(300);
    expect(refs.values().next().value).toMatch(/^C-cashier-abc-\d+-\d+-\d+$/);
  });

  test('أجهزة مختلفة لا تتشارك المرجع أبداً', () => {
    const a = newClientRef('device-a');
    const b = newClientRef('device-b');
    expect(a).not.toBe(b);
  });

  test('تحليل بطاقة QR: الصيغة الرسمية والعنوان المباشر والفاسد', () => {
    expect(parseQrConnectPayload('sela-cashier://192.168.1.20:8950')).toEqual({
      host: '192.168.1.20',
      port: 8950,
    });
    expect(parseQrConnectPayload('10.0.0.5:9000')).toEqual({
      host: '10.0.0.5',
      port: 9000,
    });
    expect(parseQrConnectPayload('hello world')).toBeNull();
    expect(parseQrConnectPayload('')).toBeNull();
  });
});
