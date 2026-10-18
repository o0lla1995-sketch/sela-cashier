/**
 * native.ts — جسر الوحدات الأصلية (LanBridge) مع الطبقة القديمة
 * المتوافقة مع New Architecture (نفس أسلوب تطبيق سيلا).
 */
import {NativeModules} from 'react-native';

export interface DiscoveredPos {
  ip: string;
  port: number;
  store: string;
  device: string;
}

interface LanBridgeNativeModule {
  discover(timeoutMs: number): Promise<DiscoveredPos[]>;
  deviceLabel(): Promise<string>;
  deviceId(): Promise<string>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<boolean>;
  removeItem(key: string): Promise<boolean>;
}

type MaybeModule<T> = T | undefined;

export const LanBridge: MaybeModule<LanBridgeNativeModule> =
  NativeModules.LanBridge as MaybeModule<LanBridgeNativeModule>;

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
