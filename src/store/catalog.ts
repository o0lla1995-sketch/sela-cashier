/**
 * store/catalog.ts — v2.0: الكتالوج + السلة + ذاكرة الصور.
 * ─────────────────────────────────────────────────────────────────
 *  • الكتالوج يُجلب من نقطة البيع ويُخزَّن محلياً (kv) — فالبيع
 *    يستمر حتى بانقطاع الاتصال بأسعار وتسعير مطابقين لمعادلة
 *    الخادم حرفياً (نفس خصم المنتج، نفس أسعار الوحدات والمتغيرات).
 *  • السلة تدعم الوحدات والمتغيرات (لون×مقاس/حجم) والوزن — إصلاح
 *    «خطأ منتج متغيرات» الذي كان يمنع بيع الملابس والأحذية.
 *  • صور المنتجات تُجلب كسولاً (productImage) وتُخزَّن في الذاكرة
 *    + على القرص — لا تُطلب مرتين أبداً.
 */
import {create} from 'zustand';
import {CashierApi} from '../api/client';
import type {CatalogProduct, CatalogVariant} from '../api/types';
import {cacheCatalog, loadCachedCatalog} from './offline';
import {LanBridge, localDb} from '../native';

interface CatalogState {
  products: CatalogProduct[];
  loading: boolean;
  lastFetchAt: number;
  fromCache: boolean;
  /** يبدأ من النسخة المخزنة (فوري) ثم يجلب تحديثاً إن توفر الاتصال. */
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * v2.1 — تطبيع بطاقة المنتج قبل دخولها الواجهة: يضمن أن units و
 * variants مصفوفتان دائماً وأن كل الحقول من الأنواع الصحيحة، مهما
 * أرسل الخادم أو أخفى التخزين المؤقت — فلا ينهار أي رسم أبداً
 * («Cannot read property of undefined») حتى مع بيانات قديمة/شاذة.
 */
function normalizeProducts(list: unknown): CatalogProduct[] {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.map(item => {
    const raw = (item ?? {}) as Record<string, unknown>;
    return {
      id: Number(raw.id ?? 0),
      name: String(raw.name ?? ''),
      categoryId:
        raw.categoryId == null ? null : Number(raw.categoryId),
      categoryName: String(raw.categoryName ?? ''),
      retailPrice: Number(raw.retailPrice ?? 0) || 0,
      wholesalePrice: Number(raw.wholesalePrice ?? 0) || 0,
      costPrice: Number(raw.costPrice ?? 0) || 0,
      discountPct: Number(raw.discountPct ?? 0) || 0,
      stockQty: Number(raw.stockQty ?? 0) || 0,
      stockUntracked: Boolean(raw.stockUntracked),
      byWeight: Boolean(raw.byWeight),
      barcode: raw.barcode == null ? null : String(raw.barcode),
      hasVariants: Boolean(raw.hasVariants),
      hasImage: Boolean(raw.hasImage),
      units: Array.isArray(raw.units)
        ? raw.units
            .filter(u => u != null)
            .map(u => ({
              id: Number(u.id ?? 0),
              name: String(u.name ?? ''),
              short: String(u.short ?? ''),
              conversion: Number(u.conversion ?? 1) || 1,
              retailPrice:
                u.retailPrice == null ? null : Number(u.retailPrice),
              barcode: u.barcode == null ? null : String(u.barcode),
            }))
        : [],
      variants: Array.isArray(raw.variants)
        ? raw.variants
            .filter(v => v != null)
            .map(v => ({
              id: Number(v.id ?? 0),
              kind: v.kind === 'size' ? ('size' as const) : ('variant' as const),
              color: String(v.color ?? ''),
              size: String(v.size ?? ''),
              retailPrice:
                v.retailPrice == null ? null : Number(v.retailPrice),
              costPrice:
                v.costPrice == null ? null : Number(v.costPrice),
              stockQty: Number(v.stockQty ?? 0) || 0,
            }))
        : [],
    };
  });
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  products: [],
  loading: false,
  lastFetchAt: 0,
  fromCache: false,

  async hydrate() {
    if (get().lastFetchAt > 0) {
      return;
    }
    const cached = normalizeProducts(await loadCachedCatalog());
    if (cached.length > 0) {
      set({products: cached, fromCache: true, lastFetchAt: -1});
    }
    await get().refresh();
  },

  async refresh() {
    if (get().loading) {
      return;
    }
    set({loading: true});
    try {
      const payload = await CashierApi.catalog();
      const products = normalizeProducts(payload?.products ?? []);
      set({products, lastFetchAt: Date.now(), fromCache: false});
      await cacheCatalog(products);
    } catch {
      // فشل الجلب — النسخة المخزنة (إن وجدت) تبقى شغالة.
      if (get().lastFetchAt === 0) {
        const cached = normalizeProducts(await loadCachedCatalog());
        if (cached.length > 0) {
          set({products: cached, fromCache: true, lastFetchAt: -1});
        }
      }
    } finally {
      set({loading: false});
    }
  },
}));

// ── ذاكرة الصور (الذاكرة + القرص) ────────────────────────────────
const memoryImages = new Map<number, string>();

/** حفظ صورة على القرص (filesDir/imgcache) — أفضل جهد. */
async function persistImage(productId: number, base64: string): Promise<void> {
  try {
    await localRun(
      'INSERT OR REPLACE INTO image_cache (product_id, base64, saved_at) VALUES (?, ?, ?)',
      [productId, base64, Date.now()],
    );
  } catch {
    // الأقراص لا تعطل البيع أبداً.
  }
}

// جدول ذاكرة الصور داخل القاعدة المحلية (يُنشأ كسولاً).
let imageTableReady = false;
async function ensureImageTable(): Promise<void> {
  if (imageTableReady) {
    return;
  }
  await localDb.run(
    `CREATE TABLE IF NOT EXISTS image_cache (
      product_id INTEGER PRIMARY KEY,
      base64 TEXT NOT NULL,
      saved_at INTEGER NOT NULL
    )`,
    [],
  );
  imageTableReady = true;
}

async function localRun(sql: string, params: unknown[]): Promise<void> {
  await ensureImageTable();
  await localDb.run(sql, params);
}

async function localSelect(
  sql: string,
  params: unknown[],
): Promise<Record<string, string | number | null>[]> {
  await ensureImageTable();
  return localDb.select(sql, params);
}

export const imageStore = {
  /** جلب صورة منتج: الذاكرة ← القرص ← الخادم (مرة واحدة فقط). */
  async get(productId: number): Promise<string | null> {
    const hit = memoryImages.get(productId);
    if (hit != null) {
      return hit;
    }
    try {
      const rows = await localSelect(
        'SELECT base64 FROM image_cache WHERE product_id = ?',
        [productId],
      );
      if (rows.length > 0 && rows[0].base64) {
        const base64 = String(rows[0].base64);
        memoryImages.set(productId, base64);
        return base64;
      }
    } catch {
      // تجاهل — نحاول الخادم.
    }
    try {
      const payload = await CashierApi.productImage(productId);
      if (payload?.image) {
        memoryImages.set(productId, payload.image);
        await persistImage(productId, payload.image);
        return payload.image;
      }
    } catch {
      return null;
    }
    return null;
  },
};

// ── التسعير (نفس معادلة الخادم حرفياً) ───────────────────────────
export function linePrice(
  product: CatalogProduct,
  unitId: number | null,
): number {
  const unit =
    unitId != null ? product.units.find(u => u.id === unitId) : undefined;
  const raw = unit
    ? unit.retailPrice ?? product.retailPrice * unit.conversion
    : product.retailPrice;
  const pct = Math.max(0, Math.min(95, product.discountPct || 0));
  return pct > 0 ? Math.round(raw * (1 - pct / 100) * 100) / 100 : raw;
}

/** سعر متغير — نفس toVariantLine/toSizedLine في نقطة البيع. */
export function variantPrice(
  product: CatalogProduct,
  variant: CatalogVariant,
): number {
  const isSize = variant.kind === 'size';
  const raw = isSize
    ? variant.retailPrice ?? product.retailPrice
    : product.retailPrice;
  const pct = Math.max(0, Math.min(95, product.discountPct || 0));
  return pct > 0 ? Math.round(raw * (1 - pct / 100) * 100) / 100 : raw;
}

/** وصف المتغير للعرض («أسود · L» أو الحجم). */
export function variantLabel(variant: CatalogVariant): string {
  return variant.kind === 'size'
    ? variant.size
    : variant.color
    ? `${variant.color} · ${variant.size}`
    : variant.size;
}

/** المخزون المتاح لسطر (وحدة/متغير/أساس) — لعرض النفاد فقط. */
export function availableStock(
  product: CatalogProduct,
  unitId: number | null,
  variantId: number | null,
): number {
  if (product.stockUntracked) {
    return 999999;
  }
  if (variantId != null) {
    const variant = product.variants.find(v => v.id === variantId);
    if (variant != null) {
      return variant.kind === 'size' ? product.stockQty : variant.stockQty;
    }
  }
  if (unitId != null) {
    const unit = product.units.find(u => u.id === unitId);
    if (unit != null && unit.conversion > 0) {
      return Math.max(0, product.stockQty / unit.conversion);
    }
  }
  return Math.max(0, product.stockQty);
}

// ── السلة ────────────────────────────────────────────────────────
export interface CartLine {
  key: string;
  product: CatalogProduct;
  unitId: number | null;
  unitName: string;
  conversion: number;
  variantId: number | null;
  variantLabel: string | null;
  unitPrice: number;
  quantity: number;
  byWeight: boolean;
}

interface CartState {
  lines: CartLine[];
  discount: number;
  add: (
    product: CatalogProduct,
    unitId: number | null,
    quantity: number,
    variantId?: number | null,
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

  add(product, unitId, quantity, variantId = null) {
    const key = `${product.id}-${unitId ?? ''}-v${variantId ?? ''}`;
    const unit =
      unitId != null ? product.units.find(u => u.id === unitId) : undefined;
    const variant =
      variantId != null
        ? product.variants.find(v => v.id === variantId)
        : undefined;
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
    const price = variant ? variantPrice(product, variant) : linePrice(product, unitId);
    set({
      lines: [
        ...get().lines,
        {
          key,
          product,
          unitId,
          unitName: variant ? 'قطعة' : unit ? unit.name : 'حبة',
          conversion: variant ? 1 : unit ? unit.conversion : 1,
          variantId,
          variantLabel: variant ? variantLabelOf(variant) : null,
          unitPrice: price,
          quantity,
          byWeight: product.byWeight && !unit && !variant,
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

function variantLabelOf(variant: CatalogVariant): string {
  return variantLabel(variant);
}

/** تفريغ أي مرجع قديم عند تسجيل الخروج. */
export function resetImageMemory(): void {
  memoryImages.clear();
}

export {LanBridge};
