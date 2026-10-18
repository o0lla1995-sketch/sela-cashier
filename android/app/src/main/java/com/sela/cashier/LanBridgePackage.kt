package com.sela.cashier

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/** حزمة وحدات سيلّا كاشير الأصلية (الاستكشاف + التخزين + البصمة). */
class LanBridgePackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext
  ): List<NativeModule> =
    listOf(LanBridgeModule(reactContext), BiometricModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = emptyList()
}
