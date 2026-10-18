package com.sela.cashier

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
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
}
