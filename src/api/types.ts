/**
 * api/types.ts — أنواع بروتوكول نقطة البيع (نفس DTO الخادم في
 * LanHandlers.ts من تطبيق سيلا).
 */

export interface CatalogUnit {
  id: number;
  name: string;
  short: string;
  conversion: number;
  retailPrice: number | null;
  barcode: string | null;
}

export interface CatalogProduct {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string;
  retailPrice: number;
  wholesalePrice: number;
  discountPct: number;
  stockQty: number;
  stockUntracked: boolean;
  byWeight: boolean;
  barcode: string | null;
  hasVariants: boolean;
  units: CatalogUnit[];
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
  itemCount: number;
  createdAt: string;
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

export interface LoginResult {
  status: 'ok' | 'pending' | 'denied' | 'inactive';
  token?: string;
  cashier?: {id: number; name: string};
  store?: {name: string};
  error?: string;
}
