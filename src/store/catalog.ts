/**
 * store/catalog.ts — كتالوج منتجات المخزون (نسخة محلية مؤقتة تُجلب
 * من نقطة البيع) + سلة البيع الحية.
 */
import {create} from 'zustand';
import {CashierApi} from '../api/client';
import type {CatalogProduct} from '../api/types';

interface CatalogState {
  products: CatalogProduct[];
  loading: boolean;
  lastFetchAt: number;
  refresh: () => Promise<void>;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  products: [],
  loading: false,
  lastFetchAt: 0,
  async refresh() {
    if (get().loading) {
      return;
    }
    set({loading: true});
    try {
      const payload = await CashierApi.catalog();
      set({products: payload.products ?? [], lastFetchAt: Date.now()});
    } finally {
      set({loading: false});
    }
  },
}));

/** سطر في سلة الكاشير — السعر محسوب من الكتالوج محلياً للعرض،
 *  والخادم يعيد التسعير الحقيقي عند إتمام البيع (مصدر الحقيقة). */
export interface CartLine {
  key: string;
  product: CatalogProduct;
  unitId: number | null;
  unitName: string;
  conversion: number;
  unitPrice: number;
  quantity: number;
}

function linePrice(product: CatalogProduct, unitId: number | null): number {
  const unit =
    unitId != null ? product.units.find(u => u.id === unitId) : undefined;
  const raw = unit
    ? unit.retailPrice ?? product.retailPrice * unit.conversion
    : product.retailPrice;
  const pct = Math.max(0, Math.min(95, product.discountPct || 0));
  return pct > 0 ? Math.round(raw * (1 - pct / 100) * 100) / 100 : raw;
}

interface CartState {
  lines: CartLine[];
  discount: number;
  add: (
    product: CatalogProduct,
    unitId: number | null,
    quantity: number,
  ) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  setDiscount: (value: number) => void;
  clear: () => void;
  subtotal: () => number;
  total: () => number;
  count: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  discount: 0,

  add(product, unitId, quantity) {
    const key = `${product.id}-${unitId ?? ''}`;
    const unit =
      unitId != null ? product.units.find(u => u.id === unitId) : undefined;
    const existing = get().lines.find(line => line.key === key);
    if (existing) {
      set({
        lines: get().lines.map(line =>
          line.key === key
            ? {...line, quantity: line.quantity + quantity}
            : line,
        ),
      });
      return;
    }
    set({
      lines: [
        ...get().lines,
        {
          key,
          product,
          unitId,
          unitName: unit ? unit.name : 'حبة',
          conversion: unit ? unit.conversion : 1,
          unitPrice: linePrice(product, unitId),
          quantity,
        },
      ],
    });
  },

  setQuantity(key, quantity) {
    if (quantity <= 0) {
      set({lines: get().lines.filter(line => line.key !== key)});
      return;
    }
    set({
      lines: get().lines.map(line =>
        line.key === key ? {...line, quantity} : line,
      ),
    });
  },

  removeLine(key) {
    set({lines: get().lines.filter(line => line.key !== key)});
  },

  setDiscount(value) {
    set({discount: Math.max(0, value)});
  },

  clear() {
    set({lines: [], discount: 0});
  },

  subtotal() {
    return get().lines.reduce(
      (sum, line) => sum + line.unitPrice * line.quantity,
      0,
    );
  },

  total() {
    const subtotal = get().subtotal();
    return Math.max(0, subtotal - get().discount);
  },

  count() {
    return get().lines.length;
  },
}));
