/**
 * store/sync.ts — v3.0: محرك المزامنة المستمر مع الاسترداد الذكي.
 * ─────────────────────────────────────────────────────────────────
 * أهم شكوى في الجولة السابقة: «المزامنة لا تعمل بشكل مستمر».
 * ثلاثة جذور حقيقية عولجت هنا:
 *
 *  ① AppState — أندرويد يجمّد مؤقتات JS في الخلفية؛ عند العودة
 *     للواجهة نُحضّر العدد المعلق ونُطلق دورة فورية فوراً (لا
 *     انتظار المؤقت البطيء).
 *  ② تغيّر IP لنقطة البيع — كان العنوان المحفوظ في الجلسة يتقادم
 *     بعد إعادة تشغيل الراوتر فيموت الاتصال إلى الأبد. الآن: بعد
 *     فشل نبضين متتاليين نُطلق بث الاستكشاف UDP ونجرب كل نقطة
 *     ظهرت على الشبكة: من يقبل رمز جلستنا الحالي (ping + طلب
 *     موثّق) هو نقطتنا — نُعيد التوجيه إليها ونحفظها في الجلسة،
 *     فتابع الكاشير يعمل دون أي إعادة إقلاع (طلبه حرفياً).
 *  ③ العدد المعلق كان يبدأ صفراً بعد الإقلاع — يُحضَّر فور بدء
 *     المراقبة كي تدفع الدورات السريعة الطابور مبكراً.
 *
 * الدورة نفسها كما هي: ping → دفع الطابور بالتسلسل (clientRef يمنع
 * أي ازدواج) → سحب تزايدي لفواتيري → تحديث الكتالوج والزبائن.
 */
import {AppState} from 'react-native';
import {create} from 'zustand';
import {CashierApi, apiBaseUrl, configureApi} from '../api/client';
import {discoverPosStores} from '../native';
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
import {refreshPendingStockAdjustments} from './catalog';
import {useSessionStore} from './session';
import type {SyncOpResult} from '../api/types';

interface SyncState {
  online: boolean;
  pushing: boolean;
  pending: number;
  lastSyncAt: string | null;
  /** آخر خطأ دفع (شبكة) — يظهر في الحساب/الإعدادات. */
  lastError: string | null;
  /** v3.0: يعمل الاستكشاف الآن لإيجاد نقطة البيع بعد تغيّر IP. */
  rediscovering: boolean;
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
  rediscovering: false,

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
      // v3.2 (الجولة 74 #6): بعد المزامنة الناجحة يتعادل المخزون —
      // العمليات غادرت المعلّق ومخزون الخادم المسحوب يشملها؛ إعادة
      // حساب التسويات كي لا يبقى أثر محلي فوق رصيد أصبح رسمياً.
      await refreshPendingStockAdjustments();
    } finally {
      set({pushing: false});
    }
  },
}));

// ── v3.0: الاسترداد بعد تغيّر IP ─────────────────────────────────

let rediscoverRunning = false;
let lastRediscoverAt = 0;

/**
 * البحث عن نقطتنا على الشبكة بعد فقدان الاتصال بالعنوان المحفوظ.
 * الجلسة (الرمز) هي هويتنا: أي نقطة تقبل الرمز وترد على طلب موثّق
 * هي نقطتنا مهما تغيّر عنوانها — نعيد التوجيه إليها ونحدّث الجلسة.
 */
async function rediscoverPos(): Promise<void> {
  if (rediscoverRunning) {
    return;
  }
  // لا نكرر البث أكثر من مرة كل 10 ثوانٍ — رحمة بالبطارية.
  if (Date.now() - lastRediscoverAt < 10000) {
    return;
  }
  rediscoverRunning = true;
  lastRediscoverAt = Date.now();
  useSyncStore.setState({rediscovering: true});
  try {
    const candidates = await discoverPosStores(2000);
    for (const candidate of candidates) {
      // جرّب هذا العنوان: ping ثم طلب موثّق برمز الجلسة الحالي.
      configureApi(candidate.ip, candidate.port);
      try {
        await CashierApi.ping();
        await CashierApi.stats(); // 401 لو الرمز ليس لهذه النقطة.
      } catch {
        continue; // ليست نقطتنا (أو الرمز أُبطل — يسقط البحث كله).
      }
      // نقطة البيع الصحيحة — احفظها في الجلسة واستأنف فوراً.
      const session = useSessionStore.getState();
      if (session.host !== candidate.ip || session.port !== candidate.port) {
        await session.updateHost(candidate.ip, candidate.port);
      }
      useSyncStore.setState({online: true, lastError: null});
      await useSyncStore.getState().runCycle({force: true});
      return;
    }
    // لم نجد نقطتنا — أعد التوجيه للعنوان الأصلي كي لا نكسر رسائل
    // الخطأ الواضحة، وسيعاد البحث في المحاولة القادمة.
    const session = useSessionStore.getState();
    if (session.host != null) {
      configureApi(session.host, session.port);
    }
  } finally {
    rediscoverRunning = false;
    useSyncStore.setState({rediscovering: false});
  }
}

// ── المراقبة المستمرة ────────────────────────────────────────────

let monitorStarted = false;
let monitorTimer: ReturnType<typeof setInterval> | null = null;
let cycleTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: {remove: () => void} | null = null;
let fastUntil = 0;
/** فشل نبض متتالٍ — بعد اثنين نبدأ البحث عن نقطتنا على الشبكة. */
let pingFailures = 0;

/**
 * بدء مراقبة المزامنة المستمرة — تُستدعى مرة بعد الدخول.
 *  • حين هناك عمليات معلقة أو انقطاع حديث: ping كل 6 ثوانٍ.
 *  • وإلا دورة كاملة كل 20 ثانية (سحب فواتير من أجهزة أخرى + كتالوج).
 *  • العودة من الخلفية (AppState active) → تحضير المعلق + دورة فورية.
 *  • فشل نبضين → بث استكشاف وإعادة اتصال بنقطتنا أينما كانت.
 */
export function startSyncMonitor(): void {
  if (monitorStarted) {
    return;
  }
  monitorStarted = true;

  // ③ العدد المعلق يُحضَّر فوراً — لا يبدأ صفراً بعد الإقلاع.
  void useSyncStore.getState().refreshPending();
  const stored = getLastSyncAt();
  void stored.then(value => {
    if (value != null && useSyncStore.getState().lastSyncAt == null) {
      useSyncStore.setState({lastSyncAt: value});
    }
  });

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
        pingFailures = 0;
        state.setOnline(true);
        if (state.pending > 0 && !state.pushing) {
          await state.runCycle({force: true});
        }
      } catch {
        pingFailures += 1;
        state.setOnline(false);
        // ② فقدنا نقطتنا (IP تغيّر؟) — ابحث عنها على الشبكة.
        if (pingFailures >= 2 && apiBaseUrl().length > 0) {
          void rediscoverPos();
        }
      }
    }
  };

  void cycle();
  monitorTimer = setInterval(() => {
    void tick();
  }, 6000);
  // دورة أبطأ للسحب العام (سحب فواتير من أجهزة أخرى + كتالوج).
  cycleTimer = setInterval(() => {
    void useSyncStore.getState().runCycle();
  }, 20000);

  // ① العودة من الخلفية → دورة فورية (المؤقتات كانت مجمدة).
  appStateSub = AppState.addEventListener('change', state => {
    if (state === 'active') {
      void useSyncStore.getState().refreshPending();
      void useSyncStore.getState().runCycle({force: true});
    }
  });
}

export function stopSyncMonitor(): void {
  if (monitorTimer != null) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
  if (cycleTimer != null) {
    clearInterval(cycleTimer);
    cycleTimer = null;
  }
  appStateSub?.remove();
  appStateSub = null;
  pingFailures = 0;
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
