/**
 * return_scoping.test.ts — v3.1 (الجولة 65): حرّوس ربط المرتجعات.
 * ─────────────────────────────────────────────────────────────────
 * الجذر الذي منع الإرجاع: استعلام المتبقي كان يعدّ مرتجعات كل
 * الفواتير الأخرى التي تتشارك رقم المنتج نفسه (وليس مرتجعات هذه
 * الفاتورة فقط)، وكان يخصم المرتجعات المتزامنة مرتين من لقطة
 * الخادم. هذه الحرّوس تُثبّت السلوك الجديد:
 *  ① الاستعلام يقيَّد بـ source_ref = فاتورة المصدر.
 *  ② التطابق بالتوقيع الكامل (منتج + متغير + وحدة).
 *  ③ onlyPending مع لقطة الخادم (المتزامنة محسوبة داخلها أصلاً).
 * ④ recordLocalOp يخزّن source_ref مع المرتجع.
 */
interface CapturedCall {
  kind: 'select' | 'run' | 'tx';
  sql: string;
  params: unknown[];
}

// كل شيء داخل مصنع المحاكاة — بلا متغيرات خارج نطاقه (قواعد
// jest.mock): __captured يقرأه الاختبار عبر requireMock.
jest.mock('../src/native', () => {
  const actual = jest.requireActual('../src/native');
  const captured: CapturedCall[] = [];
  const localDb = {
    async select(sql: string, params: unknown[] = []) {
      captured.push({kind: 'select', sql, params});
      return [];
    },
    async run(sql: string, params: unknown[] = []) {
      captured.push({kind: 'run', sql, params});
      return {insertId: 1, rowsAffected: 1};
    },
    async tx(statements: {sql: string; params?: unknown[]}[]) {
      for (const statement of statements) {
        captured.push({
          kind: 'tx',
          sql: statement.sql,
          params: statement.params ?? [],
        });
      }
      return true;
    },
  };
  return {...actual, localDb, __captured: captured};
});

import {recordLocalOp, returnedQtyForLine} from '../src/store/offline';

const captured = (jest.requireMock('../src/native') as {
  __captured: CapturedCall[];
}).__captured;

function lastCall(kind: CapturedCall['kind']): CapturedCall {
  const hit = [...captured].reverse().find(call => call.kind === kind);
  if (hit == null) {
    throw new Error('لم يُلتقط أي استدعاء من النوع المطلوب');
  }
  return hit;
}

beforeEach(() => {
  captured.length = 0;
});

describe('v3.1 — ترحيل القاعدة: عمود source_ref', () => {
  test('يُضاف لتثبيتات القواعد القديمة (أول تهيئة في الملف)', async () => {
    // أول استدعاء في الملف يشغّل initOfflineStore: CREATE + ALTER.
    // العلم المزدوج (initialized) يمنع تكرارها لاحقاً — لذا هذا
    // الحرّوس أول اختبار في الملف عمداً.
    await returnedQtyForLine('C-dev-1', 7, null, null, false);
    const alter = captured.find(
      call => call.kind === 'run' && call.sql.includes('ALTER TABLE invoices'),
    );
    expect(alter).toBeDefined();
    expect(alter!.sql).toContain('ADD COLUMN source_ref TEXT');
  });
});

describe('v3.1 — تقييد المتبقي بفاتورة المصدر (source_ref)', () => {
  test('الاستعلام يقيد المرتجعات على فاتورة المصدر نفسها', async () => {
    await returnedQtyForLine('C-dev-1', 7, null, null, false);
    const call = lastCall('select');
    expect(call.sql).toContain('i.source_ref = ?');
    expect(call.params[0]).toBe('C-dev-1');
    // التوقيع الكامل: منتج + متغير + وحدة.
    expect(call.sql).toContain('ii.product_id = ?');
    expect(call.sql).toContain('ii.variant_label = ?');
    expect(call.sql).toContain('ii.unit_name = ?');
    // بلا لقطة خادم: كل المرتجعات غير المرفوضة تُعدّ.
    expect(call.sql).toContain("i.status != 'rejected'");
  });

  test('مع لقطة الخادم: المعلّقة فقط (المتزامنة داخل اللقطة أصلاً)', async () => {
    await returnedQtyForLine('C-dev-2', 9, 'أسود · L', 'حبة', true);
    const call = lastCall('select');
    expect(call.sql).toContain("i.status = 'pending'");
    expect(call.params).toEqual([
      'C-dev-2',
      9,
      'أسود · L',
      'أسود · L',
      'حبة',
      'حبة',
    ]);
  });
});

describe('v3.1 — تسجيل المرتجع بفاتورته المصدر', () => {
  test('recordLocalOp يخزّن source_ref في صف المرتجع', async () => {
    await recordLocalOp({
      ref: 'C-dev-9',
      kind: 'return',
      displayNumber: 'م-ر-م-3',
      payKind: 'refund',
      total: -12,
      discount: 0,
      customerName: null,
      createdAt: '2026-10-19 10:00:00',
      sourceRef: 'C-dev-3',
      lines: [
        {
          productId: 7,
          name: 'عصير',
          variantId: null,
          variantLabel: null,
          unitId: null,
          unitName: 'حبة',
          quantity: 2,
          unitPrice: 4.8,
          lineTotal: 9.6,
        },
      ],
      payload: {saleClientRef: 'C-dev-3', lines: []},
    });
    const insert = captured.find(
      call => call.kind === 'tx' && call.sql.includes('INSERT INTO invoices'),
    );
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain('source_ref');
    // آخر معامل = sourceRef (بعد createdAt).
    expect(insert!.params[insert!.params.length - 1]).toBe('C-dev-3');
  });
});
