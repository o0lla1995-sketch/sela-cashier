/**
 * api/types.ts — v2.0: أنواع بروتوكول نقطة البيع (نفس DTO الخادم
 * في LanHandlers.ts) — موسّعة بالمتغيرات والصور والصلاحيات والمزامنة.
 */

export interface CatalogUnit {
  id: number;
  name: string;
  short: string;
  conversion: number;
  retailPrice: number | null;
  barcode: string | null;
}

/** v2.0: متغير المنتج (ملابس لون×مقاس / أحجام بسعر). */
export interface CatalogVariant {
  id: number;
  kind: 'variant' | 'size';
  color: string;
  size: string;
  retailPrice: number | null;
  costPrice: number | null;
  stockQty: number;
}

export interface CatalogProduct {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string;
  retailPrice: number;
  wholesalePrice: number;
  costPrice: number;
  discountPct: number;
  stockQty: number;
  stockUntracked: boolean;
  byWeight: boolean;
  barcode: string | null;
  hasVariants: boolean;
  /** v2.0: وجود صورة قابلة للجلب عبر productImage. */
  hasImage: boolean;
  units: CatalogUnit[];
  /** v2.0: متغيراته (فارغة إن لم يكن منتج متغيرات). */
  variants: CatalogVariant[];
}

export interface LocalCustomer {
  id: number;
  name: string;
  idNumber: string;
  phone: string | null;
  outstandingMinor: number;
}

export interface CashierInvoice {
  id: number;
  number: string;
  total: number;
  discount: number;
  isReturn: boolean;
  returnedMinor: number;
  paymentType: string;
  /** v3.4 (الجولة 77): طريقة الدفع الفعلية — بنك/محفظة مفعّلة أو
   *  «نقدي» — تُعرض شارةً على الفاتورة في أرشيف الكاشير. */
  paymentMethod?: string;
  itemCount: number;
  createdAt: string;
  /** v2.0: مرجع العملية من هذا الجهاز (لمطابقة الأرشيف المحلي). */
  clientRef?: string | null;
}

export interface InvoiceLine {
  saleItemId: number;
  productId: number;
  productName: string;
  quantity: number;
  unitName: string | null;
  unitPrice: number;
  total: number;
  remaining: number;
  /** v2.0: وصف المتغير إن كان السطر متغيراً (لون · مقاس). */
  variantId?: number | null;
  variantLabel?: string | null;
}

export interface InvoiceDetail {
  sale: {
    id: number;
    number: string;
    total: number;
    discount: number;
    createdAt: string;
    returnedMinor: number;
    isReturn: boolean;
  };
  book: string;
  debtState: string;
  returnsSoFar: number;
  lines: InvoiceLine[];
}

export interface StatsPayload {
  cashier: {id: number; name: string};
  perms?: CashierPerms;
  today: {
    salesCount: number;
    salesTotal: number;
    returnsCount: number;
    returnsTotal: number;
    net: number;
  };
  allTime: {
    salesCount: number;
    salesTotal: number;
    returnsCount: number;
    returnsTotal: number;
    net: number;
  };
  topProducts: {productId: number; name: string; qty: number; total: number}[];
  daily: {
    day: string;
    count: number;
    salesTotal: number;
    returnsTotal: number;
  }[];
}

/** v2.0: صلاحيات الكاشير كما يمنحها المدير من نقطة البيع. */
export interface CashierPerms {
  maxDiscountPct: number;
  canDebt: boolean;
  canReturn: boolean;
}

export interface LoginResult {
  status: 'ok' | 'pending' | 'denied' | 'inactive';
  token?: string;
  cashier?: {id: number; name: string};
  store?: {name: string};
  perms?: CashierPerms;
  error?: string;
}

/** v2.0: نتيجة عملية واحدة داخل دفعة المزامنة. */
export interface SyncOpResult {
  opId: string;
  ok: boolean;
  status?: number;
  invoice?: {
    id: number;
    number: string;
    total: number;
    discount: number;
    itemCount: number;
    createdAt: string;
  };
  return?: {
    id: number;
    number: string;
    refundMinor: number;
    exchangeMinor: number;
    isExchange: number;
  };
  duplicate?: boolean;
  error?: string;
}
