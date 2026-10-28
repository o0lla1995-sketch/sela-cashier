/**
 * screens/ScannerScreen.tsx — v3.2 (الجولة 74 #7): الماسح اللاسلكي.
 * ─────────────────────────────────────────────────────────────────
 * طلب التاجر نصاً: «تمكين التاجر من استخدام تطبيق سيلا كاشير على
 * الأندرويد لماسح ضوئي لاسلكي للباركود (بكاميرا الجوال) لإدخال
 * رموز الباركود في تطبيق سطح المكتب (عند إضافة المنتجات أو عند
 * البيع)، على أن تعمل هذه الميزة بشكل مستقل تماماً وبدون أي
 * تداخل مع المهام المحلية لتطبيق سيلا كاشير».
 *
 *  • الشاشة طبقة كاملة فوق التطبيق (Modal) — لا تلمس السلة ولا
 *    الفواتير ولا أي حالة كاشير: امسح فقط، والباركود يُرسل لنقطة
 *    البيع فوراً عبر ‎POST /api/scan ويعامله سطح المكتب كماسح USB.
 *  • التغذية الراجعة الفورية: صوت نجاح/تحذير + اهتزاز + اسم
 *    المنتج إن عرفه سطح المكتب + عدّاد المرسل وآخر القراءات.
 *  • حاجب تكرار 1.6 ثانية لنفس الكود (نفس منطق نقطة البيع) كي لا
 *    يُرسل الباركود مرتين بثبات الكاميرا عليه.
 *  • الكاميرا: react-native-camera-kit (CameraX + MLKit على
 *    أندرويد) — EAN-13/EAN-8/UPC/CODE128/CODE39/QR وغيرها.
 *  • تعمل من داخل الجلسة (بيع/فواتير/حساب) ومن شاشة الدخول إن
 *    كانت جلسة محفوظة — المهم رمز جلسة صالح واتصال بالنقطة.
 *
 * v3.4 (الجولة 77 #1): دقة وجهة القراءة وإصلاح فقد المسح المتسارع:
 *  • الرد صار يميّز ثلاث حالات: كُتبت في الحقل المركز بنقطة البيع
 *    (wedge — حقل الباركود بنموذج المنتج)، أو وصلت شاشة البيع
 *    (أُضيفت للسلة/منتج معروف)، أو لم تستقبلها نقطة البيع أصلاً —
 *    وتظهر رسالة صريحة بدل «غير معروف لنقطة البيع» المضللة التي
 *    كانت تظهر عند مسح منتج جديد لتعبئة حقل الباركود.
 *  • قراءتان متتابعتان سريعتان لم تعد تُهدر: القراءة الثانية أثناء
 *    طلب جارٍ تُصفّ في طابور (آخر قراءة تنتظر) وتُرسل فور انتهاء
 *    الأولى — كان حاجب التكرار يُحدَّث قبلها فتُهدر مرتين.
 *  • الكود القصير (<4) صار يظهر في السجل بوضوح بدل التجاهل الصامت.
 */
import React, {useCallback, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
// v3.3.1 (الجولة 76 #9b): التصدير المسمّى لا الافتراضي — الافتراضي
// في camera-kit 18 هو CameraKit (وحدة NativeModules نفسها)، وكان
// يُرسم كعنصر JSX فيرمي «Element type is invalid» فور فتح الشاشة
// (رسالة «واجه خطأً في العرض») ولا تُفتح الكاميرا إطلاقاً.
import {Camera, CameraType} from 'react-native-camera-kit';
import {SafeAreaView} from 'react-native-safe-area-context';
import {CashierApi} from '../api/client';
import {beep} from '../native';
import {fonts, makeStyles, useThemeColors} from '../theme';
import {Icon} from '../Icon';
import {useSessionStore} from '../store/session';
import {useSyncStore} from '../store/sync';

/** حاجب تكرار نفس الباركود (مللي) — نفس BARCODE_DEDUPE_MS لديسكتوب. */
const DEDUPE_MS = 1600;
/** أقصى عدد قراءات في سجل الشاشة. */
const HISTORY_LIMIT = 12;

/** نتيجة واحدة في سجل القراءات — وجهة واضحة لكل قراءة. */
interface ScanRecord {
  code: string;
  /** رسالة الحالة الجاهزة للعرض. */
  status: string;
  /** نجاح (صوت مختلف + لون) أم تنبيه؟ */
  ok: boolean;
  at: string;
}

export function ScannerScreen({onClose}: {onClose: () => void}) {
  const c = useThemeColors();
  const styles = useStyles();
  const storeName = useSessionStore(s => s.storeName);
  const online = useSyncStore(s => s.online);

  const [torch, setTorch] = useState<'on' | 'off'>('off');
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [sentCount, setSentCount] = useState(0);
  const lastScanRef = useRef<{code: string; at: number} | null>(null);
  const inFlightRef = useRef(false);
  /** v3.4: آخر قراءة وصلت أثناء طلب جارٍ — تُرسل فور فراغ الطابق. */
  const queuedRef = useRef<string | null>(null);

  const nowTime = () =>
    new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const pushRecord = useCallback((record: ScanRecord) => {
    setHistory(prev => [record, ...prev].slice(0, HISTORY_LIMIT));
  }, []);

  /** إرسال باركود واحد لنقطة البيع — حاجب تكرار + طابور انتظار
   *  للقراءة المتسارعة (لا تُهدر أبداً). */
  const sendCode = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (code.length < 4) {
        // v3.4: الكود القصير يظهر في السجل بدل التجاهل الصامت —
        // نقطة البيع ترفض أقصر من 4 محارف أصلاً.
        beep(1);
        pushRecord({
          code: code.length === 0 ? '—' : code,
          status: 'كود قصير — تتجاهله نقطة البيع (أقصر من 4)',
          ok: false,
          at: nowTime(),
        });
        return;
      }
      const now = Date.now();
      if (
        lastScanRef.current != null &&
        lastScanRef.current.code === code &&
        now - lastScanRef.current.at < DEDUPE_MS
      ) {
        return; // نفس الكود خلال الحاجب — ثبات الكاميرا لا يكرر.
      }
      if (inFlightRef.current) {
        // v3.4: طلب جارٍ — لا نُهدر القراءة ولا نلمس حاجب التكرار:
        // تُصفّ آخر قراءة وتُرسل فور انتهاء الجاري.
        queuedRef.current = code;
        return;
      }
      let current = code;
      lastScanRef.current = {code: current, at: now};
      inFlightRef.current = true;
      setSending(true);
      setErrorText(null);
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const result = await CashierApi.scan(current);
          if (result.wedge === true) {
            // كُتبت القراءة داخل الحقل المركز بنقطة البيع (حقل
            // الباركود بنموذج المنتج غالباً) — نجاح كامل حتى لو
            // المنتج غير معروف (منتج جديد بطبيعته).
            beep(0);
            pushRecord({
              code: current,
              status: 'أُدخل في الحقل المركز بنقطة البيع',
              ok: true,
              at: nowTime(),
            });
          } else if (!result.injected) {
            // لم تستقبلها نقطة البيع أصلاً — لا شاشة بيع ولا نموذج
            // مفتوح عندهم (أو لوحة مبالغ مفتوحة). رسالة صريحة بدل
            // «غير معروف» المضللة.
            beep(1);
            pushRecord({
              code: current,
              status: 'لم تستقبلها نقطة البيع — افتح شاشة البيع أو نموذج المنتج',
              ok: false,
              at: nowTime(),
            });
          } else if (result.known) {
            beep(0);
            pushRecord({
              code: current,
              status: result.productName ?? 'أُضيف لنقطة البيع',
              ok: true,
              at: nowTime(),
            });
          } else {
            // وصلت شاشة البيع لكن لا منتج بهذا الباركود عندهم.
            beep(1);
            pushRecord({
              code: current,
              status: 'وصلت نقطة البيع — لا منتج بهذا الباركود لديهم',
              ok: false,
              at: nowTime(),
            });
          }
          setSentCount(count => count + 1);
          const queued = queuedRef.current;
          queuedRef.current = null;
          if (queued == null) {
            break;
          }
          // القراءة المصفوفة تُرسل الآن بنفس الجلسة المفتوحة.
          lastScanRef.current = {code: queued, at: Date.now()};
          current = queued;
        }
      } catch (error) {
        beep(2);
        setErrorText(
          error instanceof Error
            ? error.message
            : 'تعذر إرسال الباركود لنقطة البيع',
        );
      } finally {
        inFlightRef.current = false;
        queuedRef.current = null;
        setSending(false);
      }
    },
    [pushRecord],
  );

  return (
    <View style={styles.screen}>
      {/* ── الكاميرا (Suspense — مكون Lazy من camera-kit) ── */}
      <React.Suspense
        fallback={
          <View style={styles.cameraFallback}>
            <ActivityIndicator size="large" color={c.accent} />
            <Text style={styles.fallbackText}>جارٍ تشغيل الكاميرا…</Text>
          </View>
        }>
        <Camera
          style={styles.camera}
          cameraType={CameraType.Back}
          scanBarcode
          showFrame
          frameColor={c.accent}
          laserColor={c.accent}
          barcodeFrameSize={{width: 240, height: 170}}
          torchMode={torch}
          onReadCode={(event: {
            nativeEvent: {codeStringValue: string};
          }) => {
            void sendCode(event.nativeEvent.codeStringValue);
          }}
          onError={() => {
            setErrorText('تعذر تشغيل الكاميرا — تأكد من السماح بالوصول إليها');
          }}
        />
      </React.Suspense>

      {/* ── الشريط العلوي ── */}
      <SafeAreaView style={styles.topBar} edges={['top']}>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Icon name="x" size={20} color={c.text} />
        </Pressable>
        <View style={styles.topTexts}>
          <Text style={styles.title}>الماسح اللاسلكي</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {storeName.length > 0 ? storeName : 'نقطة البيع'} ·{' '}
            <Text style={{color: online ? '#34D399' : '#F87171'}}>
              {online ? 'متصل' : 'غير متصل'}
            </Text>
            {sentCount > 0 ? ` · أُرسل ${sentCount}` : ''}
          </Text>
        </View>
        <Pressable
          style={[styles.torchBtn, torch === 'on' ? styles.torchOn : null]}
          onPress={() => setTorch(prev => (prev === 'on' ? 'off' : 'on'))}>
          <Icon
            name="flash"
            size={18}
            color={torch === 'on' ? '#FFFFFF' : c.textDim}
          />
        </Pressable>
      </SafeAreaView>

      {/* ── اللوحة السفلية: الحالة + سجل القراءات ── */}
      <SafeAreaView style={styles.bottomPanel} edges={['bottom']}>
        {sending && (
          <View style={styles.sendingRow}>
            <ActivityIndicator size="small" color={c.accent} />
            <Text style={styles.sendingText}>جارٍ الإرسال لنقطة البيع…</Text>
          </View>
        )}
        {errorText != null && !sending && (
          <View style={styles.errorRow}>
            <Icon name="alert" size={16} color="#F87171" />
            <Text style={styles.errorText}>{errorText}</Text>
          </View>
        )}
        {!sending && errorText == null && (
          <Text style={styles.hintText}>
            وجّه الكاميرا نحو الباركود — يصل سطح المكتب كماسح USB: عند البيع
            يضاف للسلة، وعند التركيز على حقل (أو فتح نموذج منتج) يُكتب فيه
          </Text>
        )}
        <ScrollView
          style={styles.historyScroll}
          contentContainerStyle={styles.historyContent}>
          {history.map((record, index) => (
            <View
              key={`${record.code}-${record.at}-${index}`}
              style={styles.historyRow}>
              <Text style={styles.historyCode} numberOfLines={1}>
                {record.code}
              </Text>
              <Text
                style={[
                  styles.historyName,
                  record.ok
                    ? {color: c.text}
                    : {color: record.code === '—' ? c.textFaint : '#FBBF24'},
                ]}
                numberOfLines={1}>
                {record.status}
              </Text>
              <Text style={styles.historyTime}>{record.at}</Text>
            </View>
          ))}
          {history.length === 0 && (
            <Text style={styles.historyEmpty}>لا قراءات بعد — ابدأ بالمسح</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const useStyles = makeStyles(c => ({
  screen: {flex: 1, backgroundColor: '#000000'},
  camera: {flex: 1},
  cameraFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#0E0E12',
  },
  fallbackText: {color: c.textDim, fontSize: 13.5},
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(14,14,18,0.88)',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTexts: {flex: 1, alignItems: 'flex-start'},
  title: {
    color: c.text,
    fontFamily: fonts.bold,
    fontSize: 15.5,
  },
  subtitle: {color: c.textDim, fontSize: 11.5, marginTop: 1},
  torchBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchOn: {backgroundColor: c.accent},
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: 260,
    backgroundColor: 'rgba(14,14,18,0.94)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  sendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  sendingText: {color: c.accent, fontSize: 12.5},
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  errorText: {color: '#F87171', fontSize: 12.5, flex: 1},
  hintText: {
    color: c.textDim,
    fontSize: 11.5,
    lineHeight: 17,
    textAlign: 'center',
    paddingVertical: 4,
  },
  historyScroll: {flexGrow: 0, marginTop: 4},
  historyContent: {paddingBottom: 10, gap: 4},
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  historyCode: {
    color: c.text,
    fontFamily: fonts.medium,
    fontSize: 12.5,
    direction: 'ltr',
    flex: 1.1,
    textAlign: 'left',
  },
  historyName: {
    color: c.text,
    fontSize: 12,
    flex: 1.9,
    textAlign: 'right',
  },
  historyTime: {color: c.textFaint, fontSize: 10.5},
  historyEmpty: {
    color: c.textFaint,
    fontSize: 11.5,
    textAlign: 'center',
    paddingVertical: 10,
  },
}));
