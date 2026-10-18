/**
 * cart.test.ts — حسابات سلة الكاشير: الإضافة بالوحدات، اشتقاق
 * الأسعار مع خصم المنتج، تعديل الكميات، والخصم الإجمالي.
 * (تُقرأ الحالة دائماً عبر getState() اللحظية — لا لقطات قديمة.)
 */
import {useCartStore} from '../src/store/catalog';

// بيانات كتالوج للاختبار — نفس شكل /api/catalog من نقطة البيع.
const simpleProduct = {
  id: 1,
  name: 'شوكولاتة',
  categoryId: 1,
  categoryName: 'حلويات',
  retailPrice: 4,
  wholesalePrice: 3,
  costPrice: 2,
  discountPct: 0,
  stockQty: 100,
  stockUntracked: false,
  byWeight: false,
  barcode: null,
  hasVariants: false,
  units: [],
};

const cigaretteProduct = {
  ...simpleProduct,
  id: 2,
  name: 'مارلبورو',
  retailPrice: 1,
  units: [
    {id: 11, name: 'علبة', short: 'علبة', conversion: 20, retailPrice: 18, barcode: null},
    {id: 12, name: 'غرام', short: 'غ', conversion: 0.001, retailPrice: 0.06, barcode: null},
  ],
};

const discountedProduct = {
  ...simpleProduct,
  id: 3,
  name: 'عصير مخفّض',
  retailPrice: 6,
  discountPct: 25,
};

const store = () => useCartStore.getState();

describe('سلة الكاشير', () => {
  test('إضافة منتج بسيط: سعر الحبة مباشرة', () => {
    store().clear();
    store().add(simpleProduct as never, null, 3);
    expect(store().lines.length).toBe(1);
    expect(store().subtotal()).toBe(12);
    expect(store().total()).toBe(12);
  });

  test('منتج بوحدات: سعر العلبة من الوحدة لا سعر الأساس', () => {
    store().clear();
    store().add(cigaretteProduct as never, 11, 2); // علبتان × 18
    expect(store().lines[0].unitPrice).toBe(18);
    expect(store().subtotal()).toBe(36);
  });

  test('وحدة بلا سعر مستقل تُشتق من الأساس × التحويل', () => {
    store().clear();
    const derived = {
      ...cigaretteProduct,
      units: [
        {id: 13, name: 'كرتونة', short: 'كرتونة', conversion: 10, retailPrice: null, barcode: null},
      ],
    };
    // التحويل بوحدات الأساس (الحبة) — 10 حبات × 1 ₪.
    store().add(derived as never, 13, 1);
    expect(store().lines[0].unitPrice).toBe(10);
  });

  test('خصم المنتج يُطبَّق على سعر الوحدة', () => {
    store().clear();
    store().add(discountedProduct as never, null, 2); // 6 − 25% = 4.5
    expect(store().lines[0].unitPrice).toBe(4.5);
    expect(store().subtotal()).toBe(9);
  });

  test('الخصم الإجمالي لا ينزل بالصافي تحت الصفر', () => {
    store().clear();
    store().add(simpleProduct as never, null, 1);
    store().setDiscount(100);
    expect(store().total()).toBe(0);
    store().clear();
  });

  test('تعديل الكمية يحذف السطر عند الصفر', () => {
    store().clear();
    store().add(simpleProduct as never, null, 2);
    const key = store().lines[0].key;
    store().setQuantity(key, 0);
    expect(store().lines.length).toBe(0);
  });

  test('إضافة نفس المنتج والوحدة تدمج السطرين', () => {
    store().clear();
    store().add(cigaretteProduct as never, 11, 1);
    store().add(cigaretteProduct as never, 11, 1);
    expect(store().lines.length).toBe(1);
    expect(store().lines[0].quantity).toBe(2);
  });
});
