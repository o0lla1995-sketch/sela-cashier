package com.sela.cashier

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import org.json.JSONArray
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.SocketTimeoutException
import java.util.concurrent.atomic.AtomicBoolean

/**
 * LanBridgeModule — واجهة الشبكة لتطبيق «سيلّا كاشير».
 * ─────────────────────────────────────────────────────────────────
 *  • discover(timeoutMs): بث UDP لطلب الاستكشاف «SELA_POS_DISCOVER_v1»
 *    على منفذ 8951 وتجميع ردود نقاط البيع سيلا على الشبكة المحلية
 *    (تُرَدّ ببطاقة JSON: المتجر/المنفذ/الجهاز) — مصفوفة فريدة
 *    بعنوان كل نقطة. البث يُرسل للعنوان العام 255.255.255.255
 *    ولبث الشبكة الفرعية معاً (بعض موجّهات Wi-Fi يمنع الأول).
 *  • deviceLabel(): اسم الجهاز المعروض عند طلب الموافقة لدى المدير.
 *  • deviceId(): معرّف ثابت للجهاز (ANDROID_ID) — به يميّز المدير
 *    جهاز الكاشير ويوافق عليه مرة واحدة.
 *  • storage: تخزين محلي بسيط (SharedPreferences) لجلسة الدخول —
 *    بلا أي مكتبة خارجية.
 */
class LanBridgeModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "LanBridge"
    const val DISCOVERY_PORT = 8951
    const val DISCOVERY_MAGIC = "SELA_POS_DISCOVER_v1"
    const val QR_REQUEST_CODE = 7321
  }

  override fun getName(): String = NAME

  private val prefs by lazy {
    reactApplicationContext.getSharedPreferences("sela_cashier", Context.MODE_PRIVATE)
  }

  /** بث الاستكشاف وتجميع ردود نقاط البيع خلال المهلة. */
  @ReactMethod
  fun discover(timeoutMs: Int, promise: Promise) {
    val running = AtomicBoolean(true)
    Thread {
      val results = Arguments.createArray()
      val seen = HashSet<String>()
      var socket: DatagramSocket? = null
      try {
        socket = DatagramSocket(null)
        socket.reuseAddress = true
        socket.broadcast = true
        socket.bind(InetSocketAddress(0))
        val payload = DISCOVERY_MAGIC.toByteArray(Charsets.UTF_8)

        val broadcastTargets = mutableListOf(InetAddress.getByName("255.255.255.255"))
        // بث الشبكة الفرعية من عنوان الجهاز نفسه (مثال: 192.168.1.255).
        try {
          val wifi = reactApplicationContext.applicationContext
            .getSystemService(Context.WIFI_SERVICE) as? android.net.wifi.WifiManager
          if (wifi != null) {
            @Suppress("DEPRECATION")
            val ip = wifi.connectionInfo.ipAddress
            if (ip != 0) {
              val subnetBroadcast = (ip or 0xFF) // نفس الشبكة مع آخر أوكتت 255
              val bytes = byteArrayOf(
                (subnetBroadcast and 0xFF).toByte(),
                ((subnetBroadcast shr 8) and 0xFF).toByte(),
                ((subnetBroadcast shr 16) and 0xFF).toByte(),
                ((subnetBroadcast shr 24) and 0xFF).toByte(),
              )
              broadcastTargets.add(InetAddress.getByAddress(bytes.reversed().toByteArray()))
            }
          }
        } catch (_: Exception) {
          // الشبكة الفرعية اختيارية — البث العام يكفي غالباً.
        }

        for (target in broadcastTargets) {
          try {
            socket.send(
              DatagramPacket(payload, payload.size, target, DISCOVERY_PORT),
            )
          } catch (_: Exception) {
            // موجّه يمنع هذا الهدف — نكمل بالبقية.
          }
        }

        val buffer = ByteArray(1024)
        val deadline = System.currentTimeMillis() + timeoutMs.coerceIn(300, 8000)
        while (running.get() && System.currentTimeMillis() < deadline) {
          try {
            socket.soTimeout = 350
            val packet = DatagramPacket(buffer, buffer.size)
            socket.receive(packet)
            val text = String(packet.data, 0, packet.length, Charsets.UTF_8)
            val card = JSONObject(text)
            if (card.optString("app") != "sela-pos") {
              continue
            }
            val ip = packet.address.hostAddress ?: continue
            val key = "$ip:${card.optInt("port", 8950)}"
            if (seen.add(key)) {
              val entry = Arguments.createMap().apply {
                putString("ip", ip)
                putInt("port", card.optInt("port", 8950))
                putString("store", card.optString("store", "متجر sela"))
                putString("device", card.optString("device", ""))
              }
              results.pushMap(entry)
            }
          } catch (e: SocketTimeoutException) {
            // استمر حتى انتهاء المهلة.
          } catch (_: Exception) {
            break
          }
        }
        promise.resolve(results)
      } catch (e: Exception) {
        promise.resolve(Arguments.createArray())
      } finally {
        running.set(false)
        try {
          socket?.close()
        } catch (_: Exception) {
        }
      }
    }.apply {
      isDaemon = true
      name = "lan-discover"
    }.start()
  }

  /** اسم الجهاز كما يظهر للمدير في طلب الموافقة. */
  @ReactMethod
  fun deviceLabel(promise: Promise) {
    promise.resolve("${Build.MANUFACTURER} ${Build.MODEL}")
  }

  /** معرّف ثابت للجهاز — به يوافق المدير على جهاز الكاشير مرة واحدة. */
  @SuppressLint("HardwareIds")
  @ReactMethod
  fun deviceId(promise: Promise) {
    try {
      val id = Settings.Secure.getString(
        reactApplicationContext.contentResolver,
        Settings.Secure.ANDROID_ID,
      )
      promise.resolve("cashier-" + (id ?: Build.FINGERPRINT))
    } catch (e: Exception) {
      promise.resolve("cashier-unknown")
    }
  }

  // ── تخزين محلي بسيط للجلسة ─────────────────────────────────────

  @ReactMethod
  fun getItem(key: String, promise: Promise) {
    promise.resolve(prefs.getString(key, null))
  }

  @ReactMethod
  fun setItem(key: String, value: String, promise: Promise) {
    prefs.edit().putString(key, value).apply()
    promise.resolve(true)
  }

  @ReactMethod
  fun removeItem(key: String, promise: Promise) {
    prefs.edit().remove(key).apply()
    promise.resolve(true)
  }

  // ── v2.0: قاعدة بيانات محلية SQLite (العمل دون اتصال) ──────────
  // أرشيف فواتير الكاشير + طابور المزامنة + كتالوج المخزون المؤقت.
  // واجهة SQL عامة صغيرة (استعلام/تنفيذ بمعاملات JSON) — منطق
  // الجداول كله في TS حيث يسهل تطويره واختباره.

  private val storeDb by lazy {
    com.sela.cashier.LocalStoreDbHelper(reactApplicationContext)
  }

  /** استعلام SELECT → مصفوفة صفوف (كل صف خريطة عمود/قيمة). */
  @ReactMethod
  fun dbQuery(sql: String, paramsJson: String, promise: Promise) {
    try {
      val params = JSONArray(paramsJson)
      val db = storeDb.readableDatabase
      val cursor = db.rawQuery(sql, Array(params.length()) { i ->
        if (params.isNull(i)) null else params.get(i).toString()
      })
      val rows = Arguments.createArray()
      while (cursor.moveToNext()) {
        val row = Arguments.createMap()
        for (col in 0 until cursor.columnCount) {
          when (cursor.getType(col)) {
            android.database.Cursor.FIELD_TYPE_NULL -> row.putNull(cursor.getColumnName(col))
            android.database.Cursor.FIELD_TYPE_INTEGER ->
              row.putDouble(cursor.getColumnName(col), cursor.getLong(col).toDouble())
            android.database.Cursor.FIELD_TYPE_FLOAT ->
              row.putDouble(cursor.getColumnName(col), cursor.getDouble(col))
            else -> row.putString(cursor.getColumnName(col), cursor.getString(col))
          }
        }
        rows.pushMap(row)
      }
      cursor.close()
      promise.resolve(rows)
    } catch (e: Exception) {
      promise.reject("DB_QUERY", e.message, e)
    }
  }

  /** تنفيذ INSERT/UPDATE/DELETE/DDL → {insertId, rowsAffected}. */
  @ReactMethod
  fun dbExecute(sql: String, paramsJson: String, promise: Promise) {
    try {
      val params = JSONArray(paramsJson)
      val db = storeDb.writableDatabase
      db.execSQL(sql, Array(params.length()) { i ->
        if (params.isNull(i)) null else params.get(i).toString()
      })
      // execSQL لا يعيد شيئاً — نقرأ last_insert_rowid من نفس الاتصال.
      val cursor = db.rawQuery("SELECT last_insert_rowid() AS id, changes() AS ch", null)
      var insertId = -1.0
      var changed = 0.0
      if (cursor.moveToFirst()) {
        insertId = cursor.getDouble(0)
        changed = cursor.getDouble(1)
      }
      cursor.close()
      val out = Arguments.createMap().apply {
        putDouble("insertId", insertId)
        putDouble("rowsAffected", changed)
      }
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("DB_EXEC", e.message, e)
    }
  }

  /** معاملة ذرية لعدة عبارات SQL: paramsJson = [[..], [..]] */
  @ReactMethod
  fun dbTransaction(statementsJson: String, promise: Promise) {
    try {
      val statements = JSONArray(statementsJson)
      val db = storeDb.writableDatabase
      db.beginTransaction()
      try {
        for (i in 0 until statements.length()) {
          val entry = statements.getJSONObject(i)
          val sql = entry.getString("sql")
          val params = entry.optJSONArray("params") ?: JSONArray()
          db.execSQL(sql, Array(params.length()) { j ->
            if (params.isNull(j)) null else params.get(j).toString()
          })
        }
        db.setTransactionSuccessful()
        promise.resolve(true)
      } finally {
        db.endTransaction()
      }
    } catch (e: Exception) {
      promise.reject("DB_TX", e.message, e)
    }
  }

  // ── v2.0: مسح باركود الاتصال (QR) ──────────────────────────────

  private var qrPromise: Promise? = null
  private val activityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(
      activity: Activity?,
      requestCode: Int,
      resultCode: Int,
      data: Intent?,
    ) {
      if (requestCode != QR_REQUEST_CODE) {
        return
      }
      val promise = qrPromise ?: return
      qrPromise = null
      if (resultCode == Activity.RESULT_OK) {
        val value = data?.getStringExtra(QrScanActivity.EXTRA_RESULT)
        if (!value.isNullOrBlank()) {
          promise.resolve(value)
          return
        }
      }
      promise.reject("QR_CANCELLED", "أُلغي المسح")
    }
  }

  init {
    reactApplicationContext.addActivityEventListener(activityEventListener)
  }

  /** فتح نافذة مسح QR الأصلية — يعيد نص البطاقة أو يرفض عند الإلغاء. */
  @ReactMethod
  fun scanQr(promise: Promise) {
    val currentActivity = currentActivity
    if (currentActivity == null) {
      promise.reject("NO_ACTIVITY", "لا توجد نافذة نشطة")
      return
    }
    qrPromise = promise
    try {
      currentActivity.startActivityForResult(
        Intent(currentActivity, QrScanActivity::class.java),
        QR_REQUEST_CODE,
      )
    } catch (e: Exception) {
      qrPromise = null
      promise.reject("QR_FAILED", e.message, e)
    }
  }

}
