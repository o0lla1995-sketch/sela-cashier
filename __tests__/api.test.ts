/**
 * api.test.ts — عميل بروتوكول نقطة البيع: الترويسة والرمز، تحليل
 * الأخطاء العربية من الخادم، ومهلة الطلب.
 */
import {configureApi, setApiToken, ApiError} from '../src/api/client';

describe('عميل API نقطة البيع', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    setApiToken(null);
  });

  test('login يبني الطلب الصحيح ويعيد الحالة', async () => {
    const {CashierApi} = require('../src/api/client');
    configureApi('192.168.1.20', 8950);
    let captured: any = null;
    global.fetch = (async (url: string, init: any) => {
      captured = {url, init};
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            status: 'ok',
            token: 'x'.repeat(64),
            cashier: {id: 1, name: 'أحمد'},
            store: {name: 'متجر الاختبار'},
          }),
      };
    }) as never;
    const result = await CashierApi.login({
      username: 'ahmad',
      password: '1234',
      deviceId: 'cashier-x',
      deviceLabel: 'جهاز',
    });
    expect(result.status).toBe('ok');
    expect(result.token?.length).toBeGreaterThanOrEqual(32);
    expect(captured.url).toBe('http://192.168.1.20:8950/api/auth/login');
    expect(captured.init.method).toBe('POST');
    const body = JSON.parse(captured.init.body);
    expect(body.username).toBe('ahmad');
    expect(body.deviceId).toBe('cashier-x');
  });

  test('رمز الجلسة يُرسل في ترويسة Authorization', async () => {
    const {CashierApi} = require('../src/api/client');
    configureApi('10.0.0.5', 8950);
    setApiToken('tok-123');
    let captured: any = null;
    global.fetch = (async (url: string, init: any) => {
      captured = {url, init};
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ok: true, invoices: []}),
      };
    }) as never;
    await CashierApi.invoices();
    expect(captured.init.headers.Authorization).toBe('Bearer tok-123');
    expect(captured.url).toContain('/api/invoices');
  });

  test('خطأ الخادم العربي يصل نصاً كما هو', async () => {
    const {CashierApi} = require('../src/api/client');
    configureApi('10.0.0.5', 8950);
    setApiToken('tok-123');
    global.fetch = (async () => ({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({ok: false, error: 'نفدت الكمية — مارلبورو'}),
    })) as never;
    await expect(CashierApi.sale({lines: [], paymentType: 'cash'})).rejects.toThrow(
      'نفدت الكمية — مارلبورو',
    );
  });

  test('انقطاع الشبكة يعطي رسالة إرشادية', async () => {
    const {CashierApi} = require('../src/api/client');
    configureApi('10.0.0.5', 8950);
    setApiToken('tok');
    global.fetch = (async () => {
      throw new Error('network down');
    }) as never;
    await expect(CashierApi.stats()).rejects.toThrow(
      'تعذر الوصول لنقطة البيع',
    );
  });
});
