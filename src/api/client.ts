/**
 * api/client.ts — عميل بروتوكول نقطة البيع سيلا عبر الشبكة المحلية.
 * ─────────────────────────────────────────────────────────────────
 * كل الطلبات JSON عبر HTTP إلى خادم نقطة البيع (Android/سطح المكتب)
 * مع رمز الجلسة (Bearer). المهلة 12 ثانية؛ الأخطاء العربية تصل
 * نصاً جاهزاً للعرض من الخادم نفسه.
 */
import type {
  CashierInvoice,
  CatalogProduct,
  InvoiceDetail,
  LocalCustomer,
  LoginResult,
  StatsPayload,
} from './types';

const TIMEOUT_MS = 12000;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let baseUrl = '';
let token: string | null = null;

export function configureApi(host: string, port: number): void {
  baseUrl = `http://${host}:${port}`;
}

export function setApiToken(value: string | null): void {
  token = value;
}

export function apiBaseUrl(): string {
  return baseUrl;
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  options?: {
    query?: Record<string, string>;
    body?: unknown;
    auth?: boolean;
  },
): Promise<T> {
  if (!baseUrl) {
    throw new ApiError('لا يوجد اتصال بنقطة البيع — سجّل الدخول أولاً', 0);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let url = `${baseUrl}${path}`;
  if (options?.query) {
    const params = new URLSearchParams(options.query).toString();
    if (params.length > 0) {
      url += `?${params}`;
    }
  }
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.auth !== false && token
          ? {Authorization: `Bearer ${token}`}
          : {}),
      },
      body:
        method === 'POST' && options?.body != null
          ? JSON.stringify(options.body)
          : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: any = {};
    try {
      payload = text.length > 0 ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }
    if (!response.ok) {
      throw new ApiError(
        payload?.error ?? `تعذر الاتصال (${response.status})`,
        response.status,
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      'تعذر الوصول لنقطة البيع — تأكد أن التطبيق مفتوح وأنكما على نفس شبكة Wi-Fi',
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

export interface LoginInput {
  username: string;
  password: string;
  deviceId: string;
  deviceLabel: string;
}

export const CashierApi = {
  /** نبض الخادم — يعيد اسم المتجر أو يرمي. */
  ping(): Promise<{ok: boolean; store: string; version: string}> {
    return request('GET', '/api/ping', {auth: false});
  },

  async login(input: LoginInput): Promise<LoginResult> {
    const payload = await request<any>('POST', '/api/auth/login', {
      body: input,
      auth: false,
    });
    return {
      status: payload.status,
      token: payload.token,
      cashier: payload.cashier,
      store: payload.store,
    };
  },

  async logout(): Promise<void> {
    try {
      await request('POST', '/api/auth/logout', {body: {}});
    } catch {
      // الخروج محلي دائماً حتى لو فشل الطلب.
    }
  },

  catalog(): Promise<{products: CatalogProduct[]}> {
    return request('GET', '/api/catalog');
  },

  async findByBarcode(
    barcode: string,
  ): Promise<CatalogProduct | null> {
    try {
      const payload = await request<{product: CatalogProduct}>('GET', '/api/products', {
        query: {barcode},
      });
      return payload.product;
    } catch {
      return null;
    }
  },

  customers(): Promise<{customers: LocalCustomer[]}> {
    return request('GET', '/api/customers');
  },

  async sale(input: {
    lines: {
      productId: number;
      unitId?: number | null;
      quantity: number;
    }[];
    discount?: number;
    paymentType: 'cash' | 'debt';
    localCustomerId?: number;
  }): Promise<{
    invoice: {
      id: number;
      number: string;
      total: number;
      discount: number;
      itemCount: number;
      createdAt: string;
    };
  }> {
    return request('POST', '/api/sale', {body: input});
  },

  invoices(limit = 40): Promise<{invoices: CashierInvoice[]}> {
    return request('GET', '/api/invoices', {query: {limit: String(limit)}});
  },

  invoice(id: number): Promise<InvoiceDetail> {
    return request('GET', '/api/invoice', {query: {id: String(id)}});
  },

  async return(input: {
    saleId: number;
    lines: {saleItemId: number; quantity: number}[];
    exchange?: {
      productId: number;
      unitId?: number | null;
      quantity: number;
    }[];
    refundMethod?: 'cash' | 'none';
    note?: string;
  }): Promise<{
    return: {
      id: number;
      number: string;
      refundMinor: number;
      exchangeMinor: number;
      isExchange: number;
    };
  }> {
    return request('POST', '/api/return', {body: input});
  },

  stats(): Promise<StatsPayload> {
    return request('GET', '/api/stats');
  },
};
