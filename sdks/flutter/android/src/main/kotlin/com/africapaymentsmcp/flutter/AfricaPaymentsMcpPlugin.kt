package com.africapaymentsmcp.flutter

import androidx.annotation.NonNull
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.MethodChannel.MethodCallHandler
import io.flutter.plugin.common.MethodChannel.Result
import java.util.*
import java.text.SimpleDateFormat
import java.util.Locale

/** AfricaPaymentsMcpPlugin */
class AfricaPaymentsMcpPlugin : FlutterPlugin, MethodCallHandler {
    private lateinit var channel: MethodChannel
    private var currentConfig: Map<String, Any>? = null

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel = MethodChannel(binding.binaryMessenger, "africa_payments_mcp")
        channel.setMethodCallHandler(this)
    }

    override fun onMethodCall(call: MethodCall, result: Result) {
        when (call.method) {
            "ping" -> result.success(true)
            "initialize" -> handleInitialize(call, result)
            "initiatePayment" -> handleInitiatePayment(call, result)
            "getTransaction" -> handleGetTransaction(call, result)
            "getTransactionHistory" -> handleGetTransactionHistory(call, result)
            "refundTransaction" -> handleRefundTransaction(call, result)
            else -> result.notImplemented()
        }
    }

    private fun handleInitialize(call: MethodCall, result: Result) {
        try {
            val config = call.arguments<Map<String, Any>>()
            if (config == null || !config.containsKey("apiKey")) {
                result.error("INVALID_CONFIG", "API key is required", null)
                return
            }
            
            currentConfig = config
            result.success(mapOf("success" to true, "message" to "SDK initialized"))
        } catch (e: Exception) {
            result.error("INIT_ERROR", e.message, null)
        }
    }

    private fun handleInitiatePayment(call: MethodCall, result: Result) {
        try {
            if (currentConfig == null) {
                result.error("NOT_INITIALIZED", "SDK not initialized", null)
                return
            }

            val request = call.arguments<Map<String, Any>>()
            if (request == null || !request.containsKey("amount")) {
                result.error("INVALID_REQUEST", "Invalid payment request", null)
                return
            }

            val transactionId = UUID.randomUUID().toString()
            val timestamp = getISO8601Timestamp()

            val response = mapOf(
                "transactionId" to transactionId,
                "status" to "pending",
                "reference" to (request["reference"] ?: ""),
                "amount" to (request["amount"] ?: 0.0),
                "currency" to (request["currency"] ?: "KES"),
                "phoneNumber" to (request["phoneNumber"] ?: ""),
                "createdAt" to timestamp,
                "updatedAt" to timestamp
            )

            result.success(response)
        } catch (e: Exception) {
            result.error("PAYMENT_ERROR", e.message, null)
        }
    }

    private fun handleGetTransaction(call: MethodCall, result: Result) {
        try {
            if (currentConfig == null) {
                result.error("NOT_INITIALIZED", "SDK not initialized", null)
                return
            }

            val transactionId = call.argument<String>("transactionId")
            if (transactionId == null) {
                result.error("INVALID_ID", "Transaction ID is required", null)
                return
            }

            val timestamp = getISO8601Timestamp()
            val transaction = mapOf(
                "transactionId" to transactionId,
                "status" to "success",
                "reference" to "REF-001",
                "amount" to 1000.0,
                "currency" to "KES",
                "phoneNumber" to "254712345678",
                "createdAt" to timestamp,
                "updatedAt" to timestamp,
                "receiptUrl" to "https://api.example.com/receipts/123"
            )

            result.success(transaction)
        } catch (e: Exception) {
            result.error("FETCH_ERROR", e.message, null)
        }
    }

    private fun handleGetTransactionHistory(call: MethodCall, result: Result) {
        try {
            if (currentConfig == null) {
                result.error("NOT_INITIALIZED", "SDK not initialized", null)
                return
            }

            val timestamp = getISO8601Timestamp()
            val transactions = listOf(
                mapOf(
                    "transactionId" to "tx-001",
                    "status" to "success",
                    "reference" to "REF-001",
                    "amount" to 1000.0,
                    "currency" to "KES",
                    "phoneNumber" to "254712345678",
                    "createdAt" to timestamp,
                    "updatedAt" to timestamp
                ),
                mapOf(
                    "transactionId" to "tx-002",
                    "status" to "pending",
                    "reference" to "REF-002",
                    "amount" to 2000.0,
                    "currency" to "KES",
                    "phoneNumber" to "254712345679",
                    "createdAt" to timestamp,
                    "updatedAt" to timestamp
                )
            )

            val history = mapOf(
                "transactions" to transactions,
                "total" to 2,
                "hasMore" to false
            )

            result.success(history)
        } catch (e: Exception) {
            result.error("FETCH_ERROR", e.message, null)
        }
    }

    private fun handleRefundTransaction(call: MethodCall, result: Result) {
        try {
            if (currentConfig == null) {
                result.error("NOT_INITIALIZED", "SDK not initialized", null)
                return
            }

            val transactionId = call.argument<String>("transactionId")
            val amount = call.argument<Double>("amount")
            
            val timestamp = getISO8601Timestamp()
            val response = mapOf(
                "transactionId" to UUID.randomUUID().toString(),
                "status" to "success",
                "reference" to "REFUND-001",
                "amount" to (amount ?: 1000.0),
                "currency" to "KES",
                "phoneNumber" to "254712345678",
                "createdAt" to timestamp,
                "updatedAt" to timestamp
            )

            result.success(response)
        } catch (e: Exception) {
            result.error("REFUND_ERROR", e.message, null)
        }
    }

    private fun getISO8601Timestamp(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
    }
}
