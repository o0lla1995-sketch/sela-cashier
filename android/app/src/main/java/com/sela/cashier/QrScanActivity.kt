package com.sela.cashier

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * QrScanActivity — v2.0: ماسح باركود الاتصال السريع.
 * ─────────────────────────────────────────────────────────────────
 * نافذة أصلية كاملة الشاشة (خارج شجرة React Native كلياً — نفس
 * الدرس المجرَّب في ScannerActivity لنقطة البيع: المعاينة تُركَّب
 * من أندرويد نفسه فلا شاشة سوداء مهما كان الروم). CameraX Preview
 * + تحليل ML Kit للرموز الرباعية (QR) فقط — النموذج مضمّن فيعمل
 * بلا إنترنت تماماً. أول قراءة ناجحة تهتز الجهاز وتعيد النص إلى
 * الوحدة وتغلق النافذة.
 *
 * صيغة البطاقة المتوقعة: sela-cashier://IP:PORT (يردِّها الخادم
 * في رمز QR بشاشة الكاشير بنقطة البيع).
 */
class QrScanActivity : Activity(), LifecycleOwner {

  companion object {
    const val EXTRA_RESULT = "qr_result"
    private const val REQUEST_CAMERA = 7311
  }

  private val lifecycleRegistry = LifecycleRegistry(this)
  private val locked = AtomicBoolean(false)
  private var previewView: PreviewView? = null
  private var statusText: TextView? = null

  override val lifecycle: Lifecycle
    get() = lifecycleRegistry

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    lifecycleRegistry.currentState = Lifecycle.State.CREATED

    val bg = Color.parseColor("#0E0E12")
    val accent = Color.parseColor("#F97316")

    // ── الواجهة: معاينة + إطار + شريط حالة عربي ──
    val root = FrameLayout(this).apply { setBackgroundColor(bg) }

    previewView = PreviewView(this).apply {
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      )
    }
    root.addView(previewView)

    // إطار التأطير الأوسط (زوايا برتقالية).
    val frame = View(this).apply {
      val dp = { v: Int -> (v * resources.displayMetrics.density).toInt() }
      val shape = GradientDrawable().apply {
        setStroke(dp(3), accent)
        cornerRadius = dp(18).toFloat()
      }
      background = shape
      alpha = 0.85f
      layoutParams = FrameLayout.LayoutParams(dp(240), dp(240), Gravity.CENTER)
    }
    root.addView(frame)

    statusText = TextView(this).apply {
      text = "وجّه الكاميرا إلى باركود الاتصال في شاشة الكاشير بنقطة البيع"
      setTextColor(Color.parseColor("#F4F4F5"))
      textSize = 15f
      gravity = Gravity.CENTER
      setPadding(dp(32), 0, dp(32), 0)
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
        Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL,
      ).apply { bottomMargin = dp(90) }
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#CC1F1F27"))
        cornerRadius = dp(14).toFloat()
      }
      // هامش داخلي عبر البطاقة
      setPadding(dp(18), dp(12), dp(18), dp(12))
    }
    root.addView(statusText)

    // زر الإلغاء أعلى اليسار.
    val cancel = TextView(this).apply {
      text = "✕ إلغاء"
      setTextColor(Color.parseColor("#F4F4F5"))
      textSize = 15f
      setPadding(dp(16), dp(10), dp(16), dp(10))
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#6626262F"))
        cornerRadius = dp(12).toFloat()
      }
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
        Gravity.TOP or Gravity.START,
      ).apply { topMargin = dp(44); leftMargin = dp(18); marginStart = dp(18) }
      setOnClickListener { finishWithResult(null) }
    }
    root.addView(cancel)

    setContentView(root)
    lifecycleRegistry.currentState = Lifecycle.State.STARTED
  }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

  override fun onResume() {
    super.onResume()
    lifecycleRegistry.currentState = Lifecycle.State.RESUMED
    if (hasCameraPermission()) {
      startCamera()
    } else {
      ActivityCompat.requestPermissions(
        this, arrayOf(Manifest.permission.CAMERA), REQUEST_CAMERA,
      )
    }
  }

  override fun onPause() {
    super.onPause()
    // نترك المزوّد يُدار من دورة الحياة — لا unbind يدوي هنا (المعاينة
    // في Activity مستقلة تنتهي بانتهائها).
  }

  private fun hasCameraPermission(): Boolean =
    ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
      PackageManager.PERMISSION_GRANTED

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == REQUEST_CAMERA) {
      if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
        startCamera()
      } else {
        statusText?.text = "إذن الكاميرا مرفوض — فعّله من إعدادات النظام أو أدخل العنوان يدوياً"
      }
    }
  }

  private fun startCamera() {
    if (locked.getAndSet(true)) {
      return // الكاميرا بدأت بالفعل أو في الطريق.
    }
    val future = ProcessCameraProvider.getInstance(this)
    future.addListener(
      {
        try {
          val provider = future.get()
          val preview = Preview.Builder().build().also {
            it.setSurfaceProvider(previewView?.surfaceProvider)
          }
          val options = BarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build()
          val scanner = BarcodeScanning.getClient(options)
          val analysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
          val executor = Executors.newSingleThreadExecutor()
          analysis.setAnalyzer(executor) { proxy: ImageProxy ->
            @androidx.camera.core.ExperimentalGetImage
            val media = proxy.image
            if (media == null) {
              proxy.close()
              return@setAnalyzer
            }
            val input = InputImage.fromMediaImage(
              media, proxy.imageInfo.rotationDegrees,
            )
            scanner.process(input)
              .addOnSuccessListener { barcodes ->
                val value = barcodes.firstOrNull()?.rawValue
                if (value != null && value.isNotBlank()) {
                  vibrate()
                  runOnUiThread { finishWithResult(value) }
                }
              }
              .addOnCompleteListener { proxy.close() }
          }
          provider.unbindAll()
          provider.bindToLifecycle(
            this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis,
          )
        } catch (e: Exception) {
          runOnUiThread {
            statusText?.text = "تعذر تشغيل الكاميرا: ${e.javaClass.simpleName}"
          }
        }
      },
      ContextCompat.getMainExecutor(this),
    )
  }

  private fun vibrate() {
    try {
      val vibrator = getSystemService(Vibrator::class.java) ?: return
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        vibrator.vibrate(
          VibrationEffect.createOneShot(60, VibrationEffect.DEFAULT_AMPLITUDE),
        )
      } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(60)
      }
    } catch (_: Exception) {
    }
  }

  private fun finishWithResult(value: String?) {
    locked.set(true)
    if (value != null) {
      intent.putExtra(EXTRA_RESULT, value)
      setResult(RESULT_OK, intent)
    } else {
      setResult(RESULT_CANCELED)
    }
    finish()
  }

  override fun onDestroy() {
    lifecycleRegistry.currentState = Lifecycle.State.DESTROYED
    super.onDestroy()
  }
}
