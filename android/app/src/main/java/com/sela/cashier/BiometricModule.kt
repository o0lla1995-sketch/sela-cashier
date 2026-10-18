package com.sela.cashier

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * BiometricModule — v3.0: بوابة الدخول بالبصمة.
 * ─────────────────────────────────────────────────────────────────
 * نفس وحدة نقطة البيع أندرويد (SelaBiometric) منقولة حرفياً لتطبيق
 * الكاشير — ميزة «الدخول للتطبيق بالبصمة» التي يفعّلها الكاشير من
 * الإعدادات: عند الإقلاع (وجلسة محفوظة) تظهر مطالبة البصمة قبل
 * الدخول إلى شاشة البيع.
 *
 *   availability() → "available" | "none_enrolled" | "unavailable"
 *   authenticate(title, subtitle, cancelText) → true | false
 *
 * ملاحظات (دروس نقطة البيع المجربة):
 *  • MainActivity في RN 0.77 ترث AppCompatActivity ترث
 *    FragmentActivity — فمطالبة البصمة تعمل مباشرة بلا أي تغيير.
 *  • الأخطاء (إلغاء المستخدم / قفل مؤقت / محاولات كثيرة) تُحلّ
 *    false بدل الرفض — الواجهة تبقي البوابة مغلقة وتتيج إعادة
 *    المحاولة، و«unavailable» تُعالج قبل الاستدعاء أصلاً.
 *  • BiometricPrompt يجب أن يعمل على خيط الواجهة؛ @ReactMethod مع
 *    Promise يعمل على خيط وحدة خلفي — فتُرسَل المطالبة عبر
 *    runOnUiThread.
 *  • مطالبة واحدة في كل لحظة — استدعاء ثانٍ أثناء عرض الأولى يُحلّ
 *    false بهدوء (لا حوارات متراصة).
 */
class BiometricModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "SelaBiometric"
  }

  @Volatile
  private var promptActive = false

  override fun getName(): String = NAME

  @ReactMethod
  fun availability(promise: Promise) {
    try {
      val manager = BiometricManager.from(reactApplicationContext)
      val code =
        manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK)
      val status = when (code) {
        BiometricManager.BIOMETRIC_SUCCESS -> "available"
        BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "none_enrolled"
        else -> "unavailable"
      }
      promise.resolve(status)
    } catch (e: Exception) {
      promise.resolve("unavailable")
    }
  }

  @ReactMethod
  fun authenticate(
    title: String,
    subtitle: String,
    cancelText: String,
    promise: Promise
  ) {
    val activity = currentActivity
    if (activity == null || activity !is FragmentActivity || activity.isFinishing) {
      promise.resolve(false)
      return
    }
    if (promptActive) {
      promise.resolve(false)
      return
    }
    activity.runOnUiThread {
      if (promptActive) {
        promise.resolve(false)
        return@runOnUiThread
      }
      try {
        val manager = BiometricManager.from(reactApplicationContext)
        val canAuth =
          manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK)
        if (canAuth != BiometricManager.BIOMETRIC_SUCCESS) {
          promise.resolve(false)
          return@runOnUiThread
        }
        promptActive = true
        val callback = object : BiometricPrompt.AuthenticationCallback() {
          override fun onAuthenticationSucceeded(
            result: BiometricPrompt.AuthenticationResult
          ) {
            promptActive = false
            promise.resolve(true)
          }

          override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
            promptActive = false
            promise.resolve(false)
          }

          override fun onAuthenticationFailed() {
            // محاولة واحدة فاشلة — نترك المطالبة مفتوحة لمحاولة أخرى.
          }
        }
        val prompt = BiometricPrompt(
          activity,
          ContextCompat.getMainExecutor(reactApplicationContext),
          callback
        )
        val info = BiometricPrompt.PromptInfo.Builder()
          .setTitle(title)
          .setSubtitle(subtitle)
          .setNegativeButtonText(cancelText)
          .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
          .build()
        prompt.authenticate(info)
      } catch (e: Exception) {
        promptActive = false
        promise.resolve(false)
      }
    }
  }
}
