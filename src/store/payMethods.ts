/**
 * store/payMethods.ts — v3.4 (الجولة 77 — كاشير #3): طرق الدفع
 * المفعّلة عند التاجر كمخزن عالمي دائم.
 * ─────────────────────────────────────────────────────────────────
 * المشكلة الجذرية التي يعالجها هذا الملف: كانت القائمة حالة محلية
 * داخل شاشة البيع تُصفّ مع كل إعادة تركيب (التبديل بين اللسانات
 * يفكك الشاشة) — فيعود العدّد إلى «نقدي وحده» حتى يكتمل الجلب من
 * نقطة البيع، وأي ضغطة «بيع» خلال تلك الفترة تسجل نقدياً بلا
 * نافذة اختيار الطريقة (شكوى التاجر نصاً: «عند إجراء عملية بيع
 * مرة اخري ومتعددة لا تظهر نافذة الخيارات دائماً وتسجل نقدي
 * مباشرة»).
 *
 * الحل ثلاثي:
 *  ① مخزن zustand عالمي — يعيش طوال الجلسة مهما فُككت الشاشات.
 *  ② تخزين محلي دائم (KV) — النسخة الأخيرة تبقى عبر إعادة تشغيل
 *     التطبيق والعمل دون اتصال، كسلوك الكتالوج والزبائن تماماً.
 *  ③ جلب فوري عند الضغط على «بيع» إن كانت القائمة لا تزال
 *     الافتراضية (نقدي وحده) والاتصال قائم — مهلة قصيرة كي لا
 *     تعوق البيع، فلا تُفقد نافذة الطرق أبداً بعد أول اتصال.
 */
import {create} from 'zustand';
import {storageGet, storageSet} from '../native';
import {CashierApi} from '../api/client';

export interface PayMethod {
  id: string;
  label: string;
  kind: string;
  color: string;
}

const KEY = 'pay_methods_v1';

/** النقدي وحده — القيمة الافتراضية قبل أي جلب ناجح. */
export const CASH_ONLY: PayMethod[] = [
  {id: 'cash', label: 'نقدي', kind: 'cash', color: '#16A34A'},
];

interface PayMethodsState {
  methods: PayMethod[];
  loaded: boolean;
  /** يملأ المخزن من التخزين المحلي عند الإقلاع (بلا اتصال). */
  hydrate: () => Promise<void>;
  /** جلب من نقطة البيع وتحديث المخزن + التخزين المحلي. */
  refresh: () => Promise<PayMethod[]>;
  /** جلب سريع إن كانت القائمة لا تزال الافتراضية — يعيد القائمة
   *  الفعلية مهما حدث (لا يرمي أبداً). */
  ensureLoaded: () => Promise<PayMethod[]>;
}

export const usePayMethodsStore = create<PayMethodsState>((set, get) => ({
  methods: CASH_ONLY,
  loaded: false,

  hydrate: async () => {
    if (get().loaded) {
      return;
    }
    try {
      const raw = await storageGet(KEY);
      if (raw != null && raw.length > 2) {
        const parsed = JSON.parse(raw) as {methods?: PayMethod[]; at?: number};
        if (Array.isArray(parsed.methods) && parsed.methods.length > 0) {
          set({methods: parsed.methods, loaded: true});
          return;
        }
      }
    } catch {
      // نسخة مخزنة تالفة — تتجاهل وتبقى القيمة الافتراضية.
    }
    set({loaded: true});
  },

  refresh: async () => {
    const result = await CashierApi.paymentMethods();
    const methods =
      Array.isArray(result.methods) && result.methods.length > 0
        ? result.methods
        : CASH_ONLY;
    set({methods, loaded: true});
    try {
      await storageSet(
        KEY,
        JSON.stringify({methods, at: Date.now()}),
      );
    } catch {
      // التخزين أفضل جهد — الذاكرة تكفي لهذه الجلسة.
    }
    return methods;
  },

  ensureLoaded: async () => {
    const current = get().methods;
    if (current.length > 1) {
      return current;
    }
    try {
      // مهلة قصيرة عبر جلب عادي — الطلب نفسه بمهلة 12 ثانية لكن
      // ضغطة البيع لا تنتظر أكثر من ثانيتين ونصف ثم تكمل بالنقدي.
      const fresh = await Promise.race([
        get().refresh(),
        new Promise<PayMethod[]>(resolve =>
          setTimeout(() => resolve(current), 2500),
        ),
      ]);
      return fresh;
    } catch {
      return current;
    }
  },
}));
