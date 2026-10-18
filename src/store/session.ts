/**
 * store/session.ts — جلسة الكاشير: نقطة البيع المتصلة + الرمز
 * والاسم — تُحفظ محلياً (SharedPreferences عبر LanBridge) كي تبقى
 * بعد إغلاق التطبيق ما دام المدير لم يُبطلها.
 */
import {create} from 'zustand';
import {
  getDeviceId,
  getDeviceLabel,
  storageGet,
  storageRemove,
  storageSet,
} from '../native';
import {CashierApi, configureApi, setApiToken} from '../api/client';

const SESSION_KEY = 'cashier_session_v1';

export interface SessionState {
  ready: boolean;
  host: string | null;
  port: number;
  storeName: string;
  token: string | null;
  cashierId: number | null;
  cashierName: string;
  deviceId: string;
  deviceLabel: string;
  restore: () => Promise<void>;
  signIn: (input: {
    host: string;
    port: number;
    token: string;
    storeName: string;
    cashierId: number;
    cashierName: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  ready: false,
  host: null,
  port: 8950,
  storeName: '',
  token: null,
  cashierId: null,
  cashierName: '',
  deviceId: '',
  deviceLabel: '',

  async restore() {
    let deviceId = '';
    let deviceLabel = '';
    try {
      deviceId = await getDeviceId();
      deviceLabel = await getDeviceLabel();
    } catch {
      deviceId = 'cashier-unknown';
      deviceLabel = 'جهاز كاشير';
    }
    const raw = await storageGet(SESSION_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as {
          host: string;
          port: number;
          token: string;
          storeName: string;
          cashierId: number;
          cashierName: string;
        };
        if (saved.token && saved.host) {
          configureApi(saved.host, saved.port ?? 8950);
          setApiToken(saved.token);
          set({
            ready: true,
            host: saved.host,
            port: saved.port ?? 8950,
            token: saved.token,
            storeName: saved.storeName ?? '',
            cashierId: saved.cashierId ?? null,
            cashierName: saved.cashierName ?? '',
            deviceId,
            deviceLabel,
          });
          return;
        }
      } catch {
        // جلسة تالفة — تسجيل دخول جديد.
      }
    }
    set({ready: true, deviceId, deviceLabel});
  },

  async signIn(input) {
    configureApi(input.host, input.port);
    setApiToken(input.token);
    set({
      host: input.host,
      port: input.port,
      token: input.token,
      storeName: input.storeName,
      cashierId: input.cashierId,
      cashierName: input.cashierName,
    });
    await storageSet(
      SESSION_KEY,
      JSON.stringify({
        host: input.host,
        port: input.port,
        token: input.token,
        storeName: input.storeName,
        cashierId: input.cashierId,
        cashierName: input.cashierName,
      }),
    );
  },

  async signOut() {
    await CashierApi.logout();
    await storageRemove(SESSION_KEY);
    setApiToken(null);
    set({
      host: null,
      token: null,
      storeName: '',
      cashierId: null,
      cashierName: '',
    });
  },
}));
