/**
 * store/settings.ts — v3.0: إعدادات تطبيق الكاشير (محلية).
 * ─────────────────────────────────────────────────────────────────
 *  • productView: شكل عرض المنتجات في صفحة البيع (شبكة/قائمة/بطاقات)
 *    — نفس أشكال نقطة البيع أندرويد، محفوظ بين الجلسات.
 *  • printReceipts: طباعة الفواتير من طابعة نقطة البيع المتصلة
 *    (تُرسل مع كل عملية بيع/إرجاع مباشرة؛ الخادم يتجاهلها إن لم
 *    تكن الطابعة متصلة).
 *  • fingerprintLock: الدخول للتطبيق بالبصمة عند الإقلاع.
 */
import {create} from 'zustand';
import {storageGet, storageSet} from '../native';

export type ProductView = 'grid' | 'list' | 'cards';

const KEY = 'app_settings_v3';

interface AppSettingsData {
  productView: ProductView;
  printReceipts: boolean;
  fingerprintLock: boolean;
}

interface AppSettingsState extends AppSettingsData {
  loaded: boolean;
  load: () => Promise<void>;
  setProductView: (view: ProductView) => void;
  setPrintReceipts: (on: boolean) => void;
  setFingerprintLock: (on: boolean) => void;
}

const DEFAULTS: AppSettingsData = {
  productView: 'grid',
  printReceipts: false,
  fingerprintLock: false,
};

export const useAppSettings = create<AppSettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  async load() {
    const raw = await storageGet(KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Partial<AppSettingsData>;
        set({
          productView: saved.productView ?? DEFAULTS.productView,
          printReceipts: saved.printReceipts ?? DEFAULTS.printReceipts,
          fingerprintLock: saved.fingerprintLock ?? DEFAULTS.fingerprintLock,
        });
      } catch {
        // قيم افتراضية.
      }
    }
    set({loaded: true});
  },

  setProductView(view) {
    set({productView: view});
    void persist(get());
  },

  setPrintReceipts(on) {
    set({printReceipts: on});
    void persist(get());
  },

  setFingerprintLock(on) {
    set({fingerprintLock: on});
    void persist(get());
  },
}));

function persist(state: AppSettingsData): Promise<void> {
  return storageSet(
    KEY,
    JSON.stringify({
      productView: state.productView,
      printReceipts: state.printReceipts,
      fingerprintLock: state.fingerprintLock,
    }),
  );
}
