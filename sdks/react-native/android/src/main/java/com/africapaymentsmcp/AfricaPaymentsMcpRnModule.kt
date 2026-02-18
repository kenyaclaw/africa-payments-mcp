package com.africapaymentsmcp

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.text.SimpleDateFormat
import java.util.*

class AfricaPaymentsMcpRnModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private var currentConfig: ReadableMap? = null
        private const val MODULE_NAME = "AfricaPaymentsMcpRn"
    }

    override fun getName(): String = MODULE_NAME

    override fun getConstants(): Map<String, Any>? {
        return hashMapOf(
            "ENVIRONMENT_SANDBOX" to "sandbox",
            "ENVIRONMENT_PRODUCTION" to "production"
        )
    }

    @ReactMethod
    fun initialize(config: ReadableMap, promise: Promise) {
        try {
            if (!config.hasKey("apiKey") || config.getString("apiKey").isNullOrEmpty()) {
                promise.reject("INVALID_CONFIG", "API key is required")
                return
            }

            currentConfig = config
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", true)
                putString("message", "SDK initialized successfully")
            })
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun initiatePayment(request: ReadableMap, promise: Promise) {
        try {
            if (currentConfig == null) {
                promise.reject("NOT_INITIALIZED", "SDK not initialized. Call initialize() first.")
                return
            }

            // Validate request
            if (!request.hasKey("amount") || !request.hasKey("phoneNumber") || !request.hasKey("reference")) {
                promise.reject("INVALID_REQUEST", "Amount, phone number, and reference are required")
                return
            }

            val transactionId = UUID.randomUUID().toString()
            val timestamp = getISO8601Timestamp()

            val response = Arguments.createMap().apply {
                putString("transactionId", transactionId)
                putString("status", "pending")
                putString("reference", request.getString("reference"))
                putDouble("amount", request.getDouble("amount"))
                putString("currency", if (request.hasKey("currency")) request.getString("currency") else "KES")
                putString("phoneNumber", request.getString("phoneNumber"))
                putString("createdAt", timestamp)
                putString("updatedAt", timestamp)
            }

            // Emit event
            emitPaymentEvent("payment.initiated", response)

            // Simulate async processing
            reactApplicationContext.runOnUiQueueThread {
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    val pendingResponse = Arguments.createMap().apply {
                        merge(response)
                        putString("updatedAt", getISO8601Timestamp())
                    }
                    emitPaymentEvent("payment.pending", pendingResponse)
                }, 2000)
            }

            promise.resolve(response)
        } catch (e: Exception) {
            promise.reject("PAYMENT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getTransaction(transactionId: String, promise: Promise) {
        try {
            if (currentConfig == null) {
                promise.reject("NOT_INITIALIZED", "SDK not initialized")
                return
            }

            val transaction = Arguments.createMap().apply {
                putString("transactionId", transactionId)
                putString("status", "success")
                putString("reference", "REF-001")
                putDouble("amount", 1000.0)
                putString("currency", "KES")
                putString("phoneNumber", "254712345678")
                putString("createdAt", getISO8601Timestamp())
                putString("updatedAt", getISO8601Timestamp())
                putString("receiptUrl", "https://api.example.com/receipts/123")
            }

            promise.resolve(transaction)
        } catch (e: Exception) {
            promise.reject("FETCH_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getTransactionHistory(query: ReadableMap, promise: Promise) {
        try {
            if (currentConfig == null) {
                promise.reject("NOT_INITIALIZED", "SDK not initialized")
                return
            }

            val transactions = Arguments.createArray().apply {
                pushMap(Arguments.createMap().apply {
                    putString("transactionId", "tx-001")
                    putString("status", "success")
                    putString("reference", "REF-001")
                    putDouble("amount", 1000.0)
                    putString("currency", "KES")
                    putString("phoneNumber", "254712345678")
                    putString("createdAt", getISO8601Timestamp())
                    putString("updatedAt", getISO8601Timestamp())
                })
                pushMap(Arguments.createMap().apply {
                    putString("transactionId", "tx-002")
                    putString("status", "pending")
                    putString("reference", "REF-002")
                    putDouble("amount", 2000.0)
                    putString("currency", "KES")
                    putString("phoneNumber", "254712345679")
                    putString("createdAt", getISO8601Timestamp())
                    putString("updatedAt", getISO8601Timestamp())
                })
            }

            val history = Arguments.createMap().apply {
                putArray("transactions", transactions)
                putInt("total", 2)
                putBoolean("hasMore", false)
            }

            promise.resolve(history)
        } catch (e: Exception) {
            promise.reject("FETCH_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun refundTransaction(transactionId: String, amount: Double?, promise: Promise) {
        try {
            if (currentConfig == null) {
                promise.reject("NOT_INITIALIZED", "SDK not initialized")
                return
            }

            val response = Arguments.createMap().apply {
                putString("transactionId", UUID.randomUUID().toString())
                putString("status", "success")
                putString("reference", "REFUND-001")
                putDouble("amount", amount ?: 1000.0)
                putString("currency", "KES")
                putString("phoneNumber", "254712345678")
                putString("createdAt", getISO8601Timestamp())
                putString("updatedAt", getISO8601Timestamp())
            }

            promise.resolve(response)
        } catch (e: Exception) {
            promise.reject("REFUND_ERROR", e.message, e)
        }
    }

    private fun emitPaymentEvent(type: String, data: ReadableMap) {
        val event = Arguments.createMap().apply {
            putString("type", type)
            putMap("data", data)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }

        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit("onPaymentEvent", event)
    }

    private fun getISO8601Timestamp(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }
}
