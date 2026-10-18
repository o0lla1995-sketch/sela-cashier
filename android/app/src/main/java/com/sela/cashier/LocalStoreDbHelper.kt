package com.sela.cashier

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * LocalStoreDbHelper — v2.0: القاعدة المحلية لتطبيق الكاشير.
 * ─────────────────────────────────────────────────────────────────
 * مخزن العمل دون اتصال (أهم طلبات التاجر): أرشيف فواتير الكاشير
 * نفسه، طابور العمليات بانتظار المزامنة، ونسخة الكتالوج والأسعار
 * ليكمل البيع حتى بانقطاع الشبكة عن نقطة البيع.
 *
 * المخطط كله يُنشأ من TS عبر dbExecute (CREATE TABLE IF NOT EXISTS)
 * عند الإقلاع — هذه الفئة مجرد حامل الملف مع WAL للأداء، فلا حاجة
 * لترقيات أصلية عند تغيّر المخطط.
 */
class LocalStoreDbHelper(context: Context) :
  SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {

  companion object {
    private const val DB_NAME = "sela_cashier_store.db"
    private const val DB_VERSION = 1
  }

  override fun onCreate(db: SQLiteDatabase) {
    // لا DDL هنا — الطبقة العليا (TS) تنشئ جداولها idempotent عند
    // كل إقلاع؛ هذا يبقي المخطط مركزياً في مكان واحد قابل للاختبار.
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    // نفس نهج onCreate — ترقية المخطط تديرها TS.
  }

  override fun onConfigure(db: SQLiteDatabase) {
    super.onConfigure(db)
    db.setForeignKeyConstraintsEnabled(true)
  }
}
