/**
 * native.ts — v3.0: جسر الوحدات الأصلية (LanBridge + SelaBiometric).
 * ─────────────────────────────────────────────────────────────────
 *  • الشبكة: discover (بث UDP) + scanQr (نافذة ماسح QR الأصلية)
 *    + scanBarcode — v3.0: ماسح باركود المنتجات (EAN/CODE128/…)
 *    لنفس زر المسح الموجود في نقطة البيع أندرويد.
 *  • الجهاز: deviceId / deviceLabel.
 *  • التخزين: KV بسيط للجلسة والثيم.
 *  • القاعدة المحلية SQLite: dbQuery / dbExecute / dbTransaction
 *    — عمود فقري «العمل دون اتصال» (أرشيف الفواتير + طابور المزامنة
 *    + كتالوج المخزون المؤقت).
 *  • v3.0 البصمة: availability / authenticate — بوابة الدخول
 *    بالبصمة المفعّلة من الإعدادات.
 */
import {NativeModules} from 'react-native';

export interface DiscoveredPos {
  ip: string;
  port: number;
  store: string;
  device: string;
}

export interface DbResult {
  insertId: number;
  rowsAffected: number;
}

export type DbRow = Record<string, string | number | null>;

interface LanBridgeNativeModule {
  discover(timeoutMs: number): Promise<DiscoveredPos[]>;
  deviceLabel(): Promise<string>;
  deviceId(): Promise<string>;
  /** v3.1: نغمة تأكيد قصيرة — 0 مسح/إضافة · 1 مزدوجة · 2 تأكيد · 3 خطأ. */
  beep(kind: number): Promise<boolean>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<boolean>;
  removeItem(key: string): Promise<boolean>;
  /** v2.0: SELECT → صفوف. */
  dbQuery(sql: string, paramsJson: string): Promise<DbRow[]>;
  /** v2.0: INSERT/UPDATE/DELETE/DDL. */
  dbExecute(
    sql: string,
    paramsJson: string,
  ): Promise<DbResult>;
  /** v2.0: معاملة ذرية لعدة عبارات. */
  dbTransaction(statementsJson: string): Promise<boolean>;
  /** فتح ماسح أصلي — v3.0: mode "qr" لبطاقة الاتصال أو "barcode"
   *  لباركود المنتجات؛ يعيد النص المقروء. */
  scanQr(mode: string): Promise<string>;
}

interface BiometricNativeModule {
  availability(): Promise<'available' | 'none_enrolled' | 'unavailable'>;
  authenticate(
    title: string,
    subtitle: string,
    cancelText: string,
  ): Promise<boolean>;
}

type MaybeModule<T> = T | undefined;

export const LanBridge: MaybeModule<LanBridgeNativeModule> =
  NativeModules.LanBridge as MaybeModule<LanBridgeNativeModule>;

export const SelaBiometric: MaybeModule<BiometricNativeModule> =
  NativeModules.SelaBiometric as MaybeModule<BiometricNativeModule>;

/** بث الاستكشاف — مصفوفة نقاط البيع على الشبكة المحلية. */
export async function discoverPosStores(
  timeoutMs = 1800,
): Promise<DiscoveredPos[]> {
  try {
    const result = await LanBridge?.discover(timeoutMs);
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

export async function getDeviceLabel(): Promise<string> {
  try {
    return (await LanBridge?.deviceLabel()) ?? 'جهاز كاشير';
  } catch {
    return 'جهاز كاشير';
  }
}

export async function getDeviceId(): Promise<string> {
  try {
    return (await LanBridge?.deviceId()) ?? 'cashier-unknown';
  } catch {
    return 'cashier-unknown';
  }
}

/**
 * v3.1: نغمة تأكيد من مكبر الجهاز (طلب الجولة 65) — نفس نغمة نقطة
 * البيع أندرويد عند مسح الباركود وإضافة المنتج للسلة. رفاهية لا
 * تكسر شيئاً: أي خطأ يُبتلع بصمت.
 */
export function beep(kind: 0 | 1 | 2 | 3 = 0): void {
  try {
    void LanBridge?.beep(kind).catch(() => {});
  } catch {
    // النغمة لا تعطل أي مسار أبداً.
  }
}

export async function storageGet(key: string): Promise<string | null> {
  try {
    return (await LanBridge?.getItem(key)) ?? null;
  } catch {
    return null;
  }
}

export async function storageSet(
  key: string,
  value: string,
): Promise<void> {
  try {
    await LanBridge?.setItem(key, value);
  } catch {
    // أفضل جهد — الجلسة تعاد عبر تسجيل الدخول.
  }
}

export async function storageRemove(key: string): Promise<void> {
  try {
    await LanBridge?.removeItem(key);
  } catch {
    // تجاهل.
  }
}

/** تحليل نتيجة QR: يقبل sela-cashier://IP:PORT أو IP:PORT مباشرة. */
export function parseQrConnectPayload(
  raw: string,
): {host: string; port: number} | null {
  const text = raw.trim();
  const match = /^sela-cashier:\/\/([^:]+):(\d+)$/.exec(text);
  if (match) {
    return {host: match[1], port: Number(match[2])};
  }
  const plain = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})$/.exec(text);
  if (plain) {
    return {host: plain[1], port: Number(plain[2])};
  }
  return null;
}

/** فتح ماسح QR الاتصال — يرفع خطأ عند الإلغاء. */
export async function scanQrCode(): Promise<string> {
  if (LanBridge == null || LanBridge.scanQr == null) {
    throw new Error('الماسح غير متاح على هذا الجهاز');
  }
  return LanBridge.scanQr('qr');
}

/**
 * v3.0: فتح ماسح باركود المنتجات (EAN-13/UPC/CODE128/CODE39/ITF…)
 * — نفس زر المسح في نقطة البيع أندرويد؛ يعيد النص أو يرفع عند الإلغاء.
 */
export async function scanProductBarcode(): Promise<string> {
  if (LanBridge == null || LanBridge.scanQr == null) {
    throw new Error('الماسح غير متاح على هذا الجهاز');
  }
  return LanBridge.scanQr('barcode');
}

// ── v3.0: البصمة (بوابة الدخول) ──────────────────────────────────

export type BiometricStatus = 'available' | 'none_enrolled' | 'unavailable';

export async function biometricAvailability(): Promise<BiometricStatus> {
  try {
    return (await SelaBiometric?.availability()) ?? 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/** مطالبة بصمة واحدة — true عند النجاح، false عند الإلغاء/الفشل. */
export async function biometricAuthenticate(
  title: string,
  subtitle: string,
  cancelText: string,
): Promise<boolean> {
  try {
    return (await SelaBiometric?.authenticate(title, subtitle, cancelText)) ?? false;
  } catch {
    return false;
  }
}

// ── v2.0: القاعدة المحلية ────────────────────────────────────────

function argsJson(params: unknown[]): string {
  return JSON.stringify(
    params.map(p =>
      p == null || (typeof p === 'number' && !Number.isFinite(p))
        ? null
        : p,
    ),
  );
}

export const localDb = {
  async select(sql: string, params: unknown[] = []): Promise<DbRow[]> {
    const rows = await LanBridge?.dbQuery(sql, argsJson(params));
    return rows ?? [];
  },

  async run(sql: string, params: unknown[] = []): Promise<DbResult> {
    const result = await LanBridge?.dbExecute(sql, argsJson(params));
    return result ?? {insertId: -1, rowsAffected: 0};
  },


  async tx(
    statements: {sql: string; params?: unknown[]}[],
  ): Promise<boolean> {
    const payload = JSON.stringify(
      statements.map(s => ({sql: s.sql, params: s.params ?? []})),
    );
    const result = await LanBridge?.dbTransaction(payload);
    return result ?? false;
  },
};
