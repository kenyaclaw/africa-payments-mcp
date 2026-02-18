import Flutter
import UIKit

public class AfricaPaymentsMcpPlugin: NSObject, FlutterPlugin {
    private var currentConfig: [String: Any]?
    
    public static func register(with registrar: FlutterPluginRegistrar) {
        let channel = FlutterMethodChannel(name: "africa_payments_mcp", binaryMessenger: registrar.messenger())
        let instance = AfricaPaymentsMcpPlugin()
        registrar.addMethodCallDelegate(instance, channel: channel)
    }

    public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "ping":
            result(true)
        case "initialize":
            handleInitialize(call, result: result)
        case "initiatePayment":
            handleInitiatePayment(call, result: result)
        case "getTransaction":
            handleGetTransaction(call, result: result)
        case "getTransactionHistory":
            handleGetTransactionHistory(call, result: result)
        case "refundTransaction":
            handleRefundTransaction(call, result: result)
        default:
            result(FlutterMethodNotImplemented)
        }
    }
    
    private func handleInitialize(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        guard let config = call.arguments as? [String: Any],
              let apiKey = config["apiKey"] as? String else {
            result(FlutterError(code: "INVALID_CONFIG", message: "API key is required", details: nil))
            return
        }
        
        currentConfig = config
        result(["success": true, "message": "SDK initialized"])
    }
    
    private func handleInitiatePayment(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        guard currentConfig != nil else {
            result(FlutterError(code: "NOT_INITIALIZED", message: "SDK not initialized", details: nil))
            return
        }
        
        guard let request = call.arguments as? [String: Any] else {
            result(FlutterError(code: "INVALID_REQUEST", message: "Invalid payment request", details: nil))
            return
        }
        
        let transactionId = UUID().uuidString
        let timestamp = ISO8601DateFormatter().string(from: Date())
        
        let response: [String: Any] = [
            "transactionId": transactionId,
            "status": "pending",
            "reference": request["reference"] ?? "",
            "amount": request["amount"] ?? 0.0,
            "currency": request["currency"] ?? "KES",
            "phoneNumber": request["phoneNumber"] ?? "",
            "createdAt": timestamp,
            "updatedAt": timestamp
        ]
        
        result(response)
    }
    
    private func handleGetTransaction(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        guard currentConfig != nil else {
            result(FlutterError(code: "NOT_INITIALIZED", message: "SDK not initialized", details: nil))
            return
        }
        
        guard let args = call.arguments as? [String: Any],
              let transactionId = args["transactionId"] as? String else {
            result(FlutterError(code: "INVALID_ID", message: "Transaction ID is required", details: nil))
            return
        }
        
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let transaction: [String: Any] = [
            "transactionId": transactionId,
            "status": "success",
            "reference": "REF-001",
            "amount": 1000.0,
            "currency": "KES",
            "phoneNumber": "254712345678",
            "createdAt": timestamp,
            "updatedAt": timestamp,
            "receiptUrl": "https://api.example.com/receipts/123"
        ]
        
        result(transaction)
    }
    
    private func handleGetTransactionHistory(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        guard currentConfig != nil else {
            result(FlutterError(code: "NOT_INITIALIZED", message: "SDK not initialized", details: nil))
            return
        }
        
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let transactions: [[String: Any]] = [
            [
                "transactionId": "tx-001",
                "status": "success",
                "reference": "REF-001",
                "amount": 1000.0,
                "currency": "KES",
                "phoneNumber": "254712345678",
                "createdAt": timestamp,
                "updatedAt": timestamp
            ],
            [
                "transactionId": "tx-002",
                "status": "pending",
                "reference": "REF-002",
                "amount": 2000.0,
                "currency": "KES",
                "phoneNumber": "254712345679",
                "createdAt": timestamp,
                "updatedAt": timestamp
            ]
        ]
        
        let history: [String: Any] = [
            "transactions": transactions,
            "total": 2,
            "hasMore": false
        ]
        
        result(history)
    }
    
    private func handleRefundTransaction(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        guard currentConfig != nil else {
            result(FlutterError(code: "NOT_INITIALIZED", message: "SDK not initialized", details: nil))
            return
        }
        
        guard let args = call.arguments as? [String: Any],
              let transactionId = args["transactionId"] as? String else {
            result(FlutterError(code: "INVALID_ID", message: "Transaction ID is required", details: nil))
            return
        }
        
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let response: [String: Any] = [
            "transactionId": UUID().uuidString,
            "status": "success",
            "reference": "REFUND-001",
            "amount": args["amount"] as? Double ?? 1000.0,
            "currency": "KES",
            "phoneNumber": "254712345678",
            "createdAt": timestamp,
            "updatedAt": timestamp
        ]
        
        result(response)
    }
}
