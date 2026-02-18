library africa_payments_mcp;

export 'src/models/models.dart';
export 'src/services/payment_service.dart';
export 'src/widgets/payment_button.dart';
export 'src/widgets/payment_sheet.dart';
export 'src/utils/payment_state.dart';

import 'package:flutter/services.dart';

class AfricaPaymentsMcp {
  static const MethodChannel _channel =
      MethodChannel('africa_payments_mcp');

  /// Initialize the SDK
  static Future<void> initialize(PaymentConfig config) async {
    await _channel.invokeMethod('initialize', config.toJson());
  }

  /// Check if native module is available
  static Future<bool> get isAvailable async {
    try {
      await _channel.invokeMethod('ping');
      return true;
    } catch (_) {
      return false;
    }
  }
}

// Export models
export 'src/models/payment_config.dart';
export 'src/models/payment_request.dart';
export 'src/models/payment_response.dart';
