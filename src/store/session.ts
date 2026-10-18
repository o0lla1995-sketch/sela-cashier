/**
 * store/session.ts — v2.0: جلسة الكاشير + صلاحياته.
 * ─────────────────────────────────────────────────────────────────
 * نقطة البيع المتصلة + الرمز والاسم + الصلاحيات التي منحها المدير
 * (سقف الخصم، البيع بالدين، المرتجعات) — تُحفظ محلياً كي تعمل
 * الجلسة كاملة بعد إعادة الفتح، وتُستخدم دون اتصال لتقييد الخصم
 * وتفعيل/إخفاء الأزرار (الخادم يفرضها مرة أخرى عند المزامنة).
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
import type {CashierPerms} from '../api/types';

const SESSION_KEY = 'cashier_session_v2';

export const DEFAULT_PERMS: CashierPerms = {
  maxDiscountPct: 10,
  canDebt: true,
  canReturn: true,
};

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
  perms: CashierPerms;
  restore: () => Promise<void>;
  signIn: (input: {
    host: string;
    port: number;
    token: string;
    storeName: string;
    cashierId: number;
    cashierName: string;
    perms?: CashierPerms;
  }) => Promise<void>;
  setPerms: (perms: CashierPerms) => void;
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
  perms: DEFAULT_PERMS,

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
          perms?: CashierPerms;
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
            perms: saved.perms ?? DEFAULT_PERMS,
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
    const perms = input.perms ?? get().perms;
    set({
      host: input.host,
      port: input.port,
      token: input.token,
      storeName: input.storeName,
      cashierId: input.cashierId,
      cashierName: input.cashierName,
      perms,
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
        perms,
      }),
    );
  },

  setPerms(perms) {
    set({perms});
    // تحديث النسخة المحفوظة فوراً.
    void (async () => {
      const raw = await storageGet(SESSION_KEY);
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          await storageSet(
            SESSION_KEY,
            JSON.stringify({...saved, perms}),
          );
        } catch {
          // تجاهل.
        }
      }
    })();
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
      perms: DEFAULT_PERMS,
    });
  },
}));
