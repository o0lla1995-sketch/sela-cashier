/**
 * store/sync.ts — v2.0: محرك المزامنة الفورية.
 * ─────────────────────────────────────────────────────────────────
 * يعمل في الخلفية طوال الجلسة (أهم طلبات التاجر):
 *  ① مراقبة الاتصال — ping كل 6 ثوانٍ (حين تكون هناك عمليات معلقة
 *     أو تحديثات دورية أبطأ عند السكون).
 *  ② عند توفر الاتصال: دفع طابور العمليات المعلقة بالتسلسل (دفعات
 *     من 10) — clientRef يمنع أي ازدواج مهما تكرر الإرسال.
 *  ③ سحب تزايدي لفواتيري من الخادم (since cursor) ودمجها بالأرشيف
 *     المحلي — فتصبح التقارير والإحصاءات كاملة من الجهازين معاً.
 *  ④ تحديث الكتالوج والزبائن المؤقتين بعد كل مزامنة ناجحة.
 *
 * لا يوجد أي مسار يمكن أن يخلق تعارض أرقام: الأرقام الحقيقية
 * تُمنح من نقطة البيع فقط؛ هذا الجهاز يرسل مراجع فريدة فقط.
 */
import {create} from 'zustand';
import {CashierApi, apiBaseUrl} from '../api/client';
import {
  bumpOpAttempts,
  cacheCatalog,
  cacheCustomers,
  getLastSyncAt,
  getPullCursor,
  initOfflineStore,
  markOpRejected,
  markOpSynced,
  mergeServerInvoices,
  pendingCount,
  pendingOps,
  setLastSyncAt,
  setPullCursor,
} from './offline';
import type {SyncOpResult} from '../api/types';

interface SyncState {
  online: boolean;
  pushing: boolean;
  pending: number;
  lastSyncAt: string | null;
  /** آخر خطأ دفع (شبكة) — يظهر في شريط الحالة. */
  lastError: string | null;
}

interface SyncActions {
  setOnline: (online: boolean) => void;
  setPending: (count: number) => void;
  refreshPending: () => Promise<void>;
  /** دفعة واحدة الآن — يعيد عدد العمليات المتبقية. */
  runCycle: (options?: {force?: boolean}) => Promise<void>;
}

export const useSyncStore = create<SyncState & SyncActions>((set, get) => ({
  online: false,
  pushing: false,
  pending: 0,
  lastSyncAt: null,
  lastError: null,

  setOnline: online => {
    if (get().online !== online) {
      set({online, lastError: online ? null : get().lastError});
    }
  },

  setPending: pending => set({pending}),

  refreshPending: async () => {
    set({pending: await pendingCount()});
  },

  runCycle: async options => {
    const state = get();
    if (state.pushing) {
      return;
    }
    if (!options?.force && !state.online) {
      return;
    }
    set({pushing: true, lastError: null});
    try {
      await initOfflineStore();

      // ① نبض الخادم — الشبكة متاحة فعلاً؟
      try {
        await CashierApi.ping();
        set({online: true});
      } catch {
        set({online: false, lastError: 'تعذر الوصول لنقطة البيع'});
        return;
      }

      // ② دفع الطابور بالتسلسل — دفعات صغيرة.
      for (let round = 0; round < 6; round += 1) {
        const ops = await pendingOps(10);
        if (ops.length === 0) {
          break;
        }
        const results: SyncOpResult[] = [];
        try {
          const payload = await CashierApi.syncPush(
            ops.map(op => ({
              opId: op.opId,
              kind: op.kind,
              payload: op.payload,
            })),
          );
          results.push(...(payload.results ?? []));
        } catch {
          // الشبكة انقطعت في منتصف الدفعة — إعادة المحاولة في
          // الدورة القادمة (clientRef يضمن عدم الازدواج).
          set({lastError: 'انقطعت الشبكة أثناء المزامنة — أعيد المحاولة تلقائياً'});
          for (const op of ops) {
            await bumpOpAttempts(op.opId, 'network');
          }
          break;
        }
        for (const result of results) {
          if (result.ok) {
            const now = new Date().toISOString().slice(0, 19);
            if (result.invoice != null) {
              await markOpSynced(result.opId, result.invoice.number, now);
            } else if (result.return != null) {
              await markOpSynced(result.opId, result.return.number, now);
            } else {
              await markOpSynced(result.opId, '—', now);
            }
          } else {
            // رفض نهائي من الخادم (سبب واضح) — يبقى في الأرشيف
            // بحالته كي يطلع عليه الكاشير ويعرف السبب.
            await markOpRejected(
              result.opId,
              result.error ?? 'رُفضت العملية من نقطة البيع',
            );
          }
        }
      }

      // ③ سحب تزايدي لفواتيري من الخادم.
      try {
        const cursor = await getPullCursor();
        const pulled = await CashierApi.invoices(150, cursor);
        for (const invoice of pulled.invoices ?? []) {
          if (invoice.id > cursor) {
            await setPullCursor(invoice.id);
          }
        }
        await mergeServerInvoices(pulled.invoices ?? []);
      } catch {
        // السحب فشل — الدفع وحده كافٍ لهذه الدورة.
      }

      // ④ تحديث الكتالوج والزبائن المؤقتين.
      try {
        const catalog = await CashierApi.catalog();
        await cacheCatalog(catalog.products ?? []);
        const customers = await CashierApi.customers();
        await cacheCustomers(customers.customers ?? []);
      } catch {
        // الكتالوج القديم يكفي لحين الدورة القادمة.
      }

      const now = new Date().toISOString().slice(0, 19);
      await setLastSyncAt(now);
      set({
        lastSyncAt: now,
        pending: await pendingCount(),
        lastError: null,
      });
    } finally {
      set({pushing: false});
    }
  },
}));

let monitorStarted = false;
let monitorTimer: ReturnType<typeof setInterval> | null = null;
let fastUntil = 0;

/**
 * بدء مراقبة المزامنة المستمرة — تُستدعى مرة بعد الدخول.
 *  • حين هناك عمليات معلقة أو انقطاع حديث: ping كل 6 ثوانٍ.
 *  • وإلا دورة كاملة كل 30 ثانية (سحب فواتير من أجهزة أخرى + كتالوج).
 */
export function startSyncMonitor(): void {
  if (monitorStarted) {
    return;
  }
  monitorStarted = true;
  const cycle = async () => {
    const state = useSyncStore.getState();
    const busy = state.pending > 0 || !state.online;
    if (busy) {
      fastUntil = Date.now() + 120000; // دقيقتان من الإيقاع السريع.
    }
    await state.runCycle({force: state.pending > 0});
  };
  const tick = async () => {
    const state = useSyncStore.getState();
    if (Date.now() < fastUntil || state.pending > 0 || !state.online) {
      // نبض سريع: ping فقط (رخيص).
      try {
        await CashierApi.ping();
        state.setOnline(true);
        if (state.pending > 0 && !state.pushing) {
          await state.runCycle({force: true});
        }
      } catch {
        state.setOnline(false);
      }
    }
  };
  void cycle();
  monitorTimer = setInterval(() => {
    void tick();
  }, 6000);
  // دورة أبطأ للسحب العام.
  setInterval(() => {
    void useSyncStore.getState().runCycle();
  }, 30000);
}

export function stopSyncMonitor(): void {
  if (monitorTimer != null) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
  monitorStarted = false;
}

/** استدعاء فوري بعد أي عملية محلية جديدة (بيع/مرتجع دون اتصال). */
export function kickSync(): void {
  void useSyncStore.getState().refreshPending();
  void useSyncStore.getState().runCycle({force: true});
}

/** هل جلسة الخادم مضبوطة أصلاً؟ */
export function hasServer(): boolean {
  return apiBaseUrl().length > 0;
}
