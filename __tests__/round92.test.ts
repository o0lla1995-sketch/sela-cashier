/**
 * round92.test.ts — v3.6.0 (الجولة 92 — كاشير #1/#3): حرّوس صف
 * الفلاتر الموحّد وزر تأكيد الدفع.
 * ─────────────────────────────────────────────────────────────────
 * ① (كاشير #1 — الفلاتر): فلاتر قنوات الدفع في نفس صف فلاتر نوع
 *    الفاتورة (طلب التاجر نصاً) — رقائق النوع ثم فاصل ثم رقائق
 *    القنوات بشعاراتها، والصف كله يتمرر أفقياً.
 * ② (كاشير #3 — زر التأكيد): لمس البطاقة يحدّدها فقط؛ لا بيع إلا
 *    بضغط «تأكيد الدفع عبر …» (كما في نقطة البيع أندرويد) — كانت
 *    البطاقة تبيع فور لمسها فلا زر تأكيد إطلاقاً.
 * ③ مسامير الإصدار 3.7.0 (14) — حُدّثت للجولة 93.
 */
import {describe, expect, test} from '@jest/globals';
import {readFileSync} from 'node:fs';
import {APP_VERSION, APP_BUILD_CODE, APP_VERSION_LABEL} from '../src/core/config';

const read = (p: string) => readFileSync(p, 'utf8') as string;
const SELL = 'src/screens/SellScreen.tsx';
const INVOICES = 'src/screens/InvoicesScreen.tsx';

describe('v3.6 (كاشير #1) — قنوات الدفع بنفس صف نوع الفاتورة', () => {
  test('الصف الموحّد: رقائق النوع والقنوات في ScrollView واحد', () => {
    const src = read(INVOICES);
    // الصف الموحّد القابل للتمرير الأفقي.
    expect(src).toContain('styles.kindRowScroll');
    expect(src).toContain('styles.kindRowContent');
    // رقائق النوع (الكل/مبيعات/مرتجعات/ديون) داخل الصف نفسه.
    expect(src).toContain(`{key: 'sales', label: 'مبيعات'}`);
    // رقائق القنوات تُبنى في نفس الصف بعد فاصل رفيع.
    expect(src).toContain('styles.filterDivider');
    expect(src).toContain('styles.payChipInKindRow');
    expect(src).toContain(`payFilter === method.id`);
  });

  test('لا يبقى صف قنوات منفصل قديم', () => {
    const src = read(INVOICES);
    expect(src).not.toContain('styles.payFilterRow');
    expect(src).not.toContain('styles.payChip:');
  });
});

describe('v3.6 (كاشير #3) — زر تأكيد الدفع بعد اختيار القناة', () => {
  test('اللمس يحدّد فقط (لا بيع فوري من البطاقة)', () => {
    const src = read(SELL);
    expect(src).toContain('const [pickedMethod, setPickedMethod] = useState<string | null>(null);');
    // لمس البطاقة يعيّن الاختيار لا البيع.
    expect(src).toContain('onPress={() => setPickedMethod(m.id)}');
    // لم يبق البيع الفوري عند اللمس.
    expect(src).not.toContain("onPress={() => {\n                    setPayPicker(false);\n                    void completeSale('cash', undefined, m.id);\n                  }}");
  });

  test('زر التأكيد معطّل حتى الاختيار ويحمل اسم القناة', () => {
    const src = read(SELL);
    expect(src).toContain('تأكيد الدفع عبر');
    expect(src).toContain('اختر طريقة الدفع أولاً');
    expect(src).toContain('disabled={pickedMethod == null || busy}');
    expect(src).toContain("void completeSale('cash', undefined, pickedMethod);");
  });

  test('البطاقة المحددة تتميز بصرياً بعلامة اختيار', () => {
    const src = read(SELL);
    expect(src).toContain('styles.payCardSelected');
    expect(src).toContain('styles.payCheckChip');
  });

  test('الإلغاء والخلفية يفرغان الاختيار', () => {
    const src = read(SELL);
    // عدد مواضع إفراغ الاختيار عند الإغلاق (خلفية + إلغاء + تأكيد).
    const resets = src.match(/setPickedMethod\(null\)/g) ?? [];
    expect(resets.length).toBeGreaterThanOrEqual(3);
  });
});

describe('v3.6 — مسامير الإصدار', () => {
  test('config: 3.7.0 (14)', () => {
    expect(APP_VERSION).toBe('3.7.0');
    expect(APP_BUILD_CODE).toBe(14);
    expect(APP_VERSION_LABEL).toBe('3.7.0 (14)');
  });

  test('build.gradle: versionCode 14 و versionName 3.7.0', () => {
    const gradle = read('android/app/build.gradle');
    expect(gradle).toContain('versionCode 14');
    expect(gradle).toContain('versionName "3.7.0"');
  });

  test('package.json: 3.7.0', () => {
    const pkg = JSON.parse(read('package.json')) as {version: string};
    expect(pkg.version).toBe('3.7.0');
  });
});
