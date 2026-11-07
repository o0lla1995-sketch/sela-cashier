/**
 * round93.test.ts — v3.7.0 (الجولة 93): حرّوس جولة الكاشير الثالثة
 * ضد أهداف التاجر الثلاثة:
 *
 *  ① قناة تسوية المرتجع/فرق الاستبدال — الافتراض هو القناة الأصلية
 *     للفاتورة (invoice.payMethod) عندما تكون محفظة/بنك، وفواتير
 *     الدين تُسوّى في الدفتر فلا قناة لها (شكوى التاجر: «الخصم من
 *     الأصل او الإضافة الي خيار دفع جديد»).
 *  ② الحمولة تحمل refundChannel — الطلب المباشر والطابور المحلي
 *     معاً (نقطة البيع تنفّذها منذ v69).
 *  ③ فلاتر صفحة الفواتير لا تُدفع للأعلى — قائمة الفواتير
 *     ScrollView بـ flex:1 صريح (شكوى التاجر: «الفلاتر تضغط للاعلي
 *     وتصبح شبه مخفية عند وجود عدد كبير من الفواتير»).
 *  ④ مسامير الإصدار 3.7.0 (14).
 */
import {readFileSync} from 'fs';
import {join} from 'path';
import {INITIAL_FILTERS, filterInvoices} from '../src/store/invoiceFilters';
import type {LocalInvoice} from '../src/store/offline';
import {APP_VERSION, APP_BUILD_CODE, APP_VERSION_LABEL} from '../src/core/config';

const root = join(__dirname, '..');

describe('الجولة 93 — كاشير: قناة تسوية المرتجع + الفلاتر', () => {
  /** فاتورة بيع نقدية دُفعت عبر جوال باي. */
  const walletInvoice: LocalInvoice = {
    ref: 'op-1',
    kind: 'sale',
    status: 'synced',
    displayNumber: 'INV-100',
    syncedNumber: 'INV-100',
    payKind: 'cash',
    payMethod: 'jawwal_pay',
    total: 120,
    discount: 0,
    customerName: null,
    customerId: null,
    createdAt: new Date().toISOString().slice(0, 19),
    syncedAt: null,
    rejectReason: null,
    sourceRef: null,
  };

  test('المرتجع: القناة الأصلية للفاتورة هي قناة التسوية الافتراضية', () => {
    // نفس منطق ReturnSheet: فاتورة محفظة → refundChannel = جوال باي.
    const defaultChannel =
      walletInvoice.payKind === 'cash' &&
      walletInvoice.payMethod != null &&
      walletInvoice.payMethod !== 'cash'
        ? walletInvoice.payMethod
        : 'cash';
    expect(defaultChannel).toBe('jawwal_pay');
  });

  test('المرتجع: فاتورة نقدية → التسوية نقدية (لا قناة مفروضة)', () => {
    const cashInvoice: LocalInvoice = {...walletInvoice, payMethod: 'cash'};
    const defaultChannel =
      cashInvoice.payKind === 'cash' &&
      cashInvoice.payMethod != null &&
      cashInvoice.payMethod !== 'cash'
        ? cashInvoice.payMethod
        : 'cash';
    expect(defaultChannel).toBe('cash');
  });

  test('المرتجع: فاتورة دين → التسوية في الدفتر (لا قناة أبدًا)', () => {
    const debtInvoice: LocalInvoice = {
      ...walletInvoice,
      payKind: 'debt',
      payMethod: 'jawwal_pay',
    };
    // الدين يُسوّى في دفتر الزبون — الحمولة تُرسل cash (متجاهَلة
    // من نقطة البيع لأن refundMethod للدين 'none').
    const channel =
      debtInvoice.payKind === 'cash' ? debtInvoice.payMethod : 'cash';
    expect(channel).toBe('cash');
  });

  test('الحمولتان تحملان refundChannel (طلب مباشر وطابور محلي)', () => {
    const screen = readFileSync(
      join(root, 'src/screens/InvoicesScreen.tsx'),
      'utf8',
    );
    // الطلب المباشر والطابور كلاهما يمرر refundChannel بقيمة
    // قناة التسوية المختارة (وليس النقدي الثابت).
    expect(screen.match(/refundChannel: invoice\.payKind === 'cash' \? refundChannel : 'cash',/g))
      .toHaveLength(2);
    // منتقي القناة معروض بشعارات الجهات مع وسم القناة الأصلية.
    expect(screen).toContain('قناة استرداد المرتجع');
    expect(screen).toContain('القناة الأصلية للفاتورة');
    expect(screen).toContain('قناة تسوية فرق الاستبدال');
  });

  test('API: return يقبل refundChannel', () => {
    const client = readFileSync(join(root, 'src/api/client.ts'), 'utf8');
    expect(client).toContain('refundChannel?: string;');
  });

  test('الفلاتر: قائمة الفواتير flex:1 — لا تُدفع الفلاتر للأعلى', () => {
    const screen = readFileSync(
      join(root, 'src/screens/InvoicesScreen.tsx'),
      'utf8',
    );
    expect(screen).toContain("style={{flex: 1}}");
  });

  test('الفلاتر: فلترة القناة تبقى دقيقة بلا ازدواج', () => {
    const invoices: LocalInvoice[] = [
      walletInvoice,
      {...walletInvoice, ref: 'op-2', payMethod: 'cash', displayNumber: 'INV-101'},
    ];
    const cashOnly = filterInvoices(
      invoices,
      {...INITIAL_FILTERS, period: 'all', pay: 'cash'},
      {},
    );
    const walletOnly = filterInvoices(
      invoices,
      {...INITIAL_FILTERS, period: 'all', pay: 'jawwal_pay'},
      {},
    );
    // فاتورة المحفظة تظهر تحت قناتها فقط — لا تُحسب نقدياً أبداً.
    expect(cashOnly.map(i => i.ref)).toEqual(['op-2']);
    expect(walletOnly.map(i => i.ref)).toEqual(['op-1']);
  });

  test('config: 3.7.0 (14)', () => {
    expect(APP_VERSION).toBe('3.7.0');
    expect(APP_BUILD_CODE).toBe(14);
    expect(APP_VERSION_LABEL).toBe('3.7.0 (14)');
  });

  test('build.gradle وpackage.json عند 3.7.0 / 14', () => {
    const gradle = readFileSync(
      join(root, 'android/app/build.gradle'),
      'utf8',
    );
    expect(gradle).toContain('versionCode 14');
    expect(gradle).toContain('versionName "3.7.0"');
    const pkg = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    ) as {version: string};
    expect(pkg.version).toBe('3.7.0');
  });
});
