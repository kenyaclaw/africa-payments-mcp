import 'package:flutter/material.dart';
import '../models/payment_config.dart';
import '../models/payment_request.dart';
import '../services/payment_service.dart';
import '../utils/payment_state.dart';

/// Callback for payment completion
typedef PaymentSuccessCallback = void Function(PaymentResponse response);
typedef PaymentErrorCallback = void Function(String error);

/// A customizable payment button widget
class PaymentButton extends StatefulWidget {
  /// Payment configuration
  final PaymentConfig config;

  /// Payment request details
  final PaymentRequest request;

  /// Button text
  final String? title;

  /// Called when payment succeeds
  final PaymentSuccessCallback? onSuccess;

  /// Called when payment fails
  final PaymentErrorCallback? onError;

  /// Called when payment is pending
  final ValueChanged<PaymentResponse>? onPending;

  /// Custom button style
  final ButtonStyle? style;

  /// Custom text style
  final TextStyle? textStyle;

  /// Loading indicator color
  final Color? loadingColor;

  /// Button height
  final double? height;

  /// Button border radius
  final double? borderRadius;

  /// Custom icon widget
  final Widget? icon;

  /// Whether to show the icon
  final bool showIcon;

  /// Whether the button is disabled
  final bool disabled;

  const PaymentButton({
    super.key,
    required this.config,
    required this.request,
    this.title,
    this.onSuccess,
    this.onError,
    this.onPending,
    this.style,
    this.textStyle,
    this.loadingColor,
    this.height,
    this.borderRadius,
    this.icon,
    this.showIcon = true,
    this.disabled = false,
  });

  @override
  State<PaymentButton> createState() => _PaymentButtonState();
}

class _PaymentButtonState extends State<PaymentButton> {
  late PaymentNotifier _notifier;
  PaymentService? _service;

  @override
  void initState() {
    super.initState();
    _notifier = PaymentNotifier();
    _initialize();
  }

  Future<void> _initialize() async {
    _service = PaymentService();
    try {
      await _service!.initialize(widget.config);
      _notifier.initialize();
    } catch (e) {
      _notifier.setError('Failed to initialize: $e');
    }
  }

  @override
  void dispose() {
    _notifier.dispose();
    _service?.dispose();
    super.dispose();
  }

  Future<void> _handlePayment() async {
    if (_service == null) return;

    _notifier.setLoading(true);

    try {
      final response = await _service!.initiatePayment(widget.request);

      if (response.isSuccess) {
        _notifier.setSuccess(response);
        widget.onSuccess?.call(response);
      } else if (response.isPending) {
        _notifier.setSuccess(response);
        widget.onPending?.call(response);
      } else {
        _notifier.setError(response.failureReason ?? 'Payment failed');
        widget.onError?.call(response.failureReason ?? 'Payment failed');
      }
    } on PaymentException catch (e) {
      _notifier.setError(e.message);
      widget.onError?.call(e.message);
    } catch (e) {
      _notifier.setError('An unexpected error occurred');
      widget.onError?.call('An unexpected error occurred');
    }
  }

  String get _buttonText {
    if (widget.title != null) return widget.title!;
    return 'Pay ${widget.request.currency} ${widget.request.amount.toStringAsFixed(2)}';
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<PaymentState>(
      valueListenable: _notifier,
      builder: (context, state, child) {
        final isLoading = state.isLoading;
        final isDisabled = widget.disabled || isLoading;

        final defaultStyle = ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF00A86B),
          foregroundColor: Colors.white,
          minimumSize: Size(double.infinity, widget.height ?? 48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(widget.borderRadius ?? 8),
          ),
          elevation: 2,
        );

        return ElevatedButton(
          onPressed: isDisabled ? null : _handlePayment,
          style: widget.style ?? defaultStyle,
          child: isLoading
              ? SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      widget.loadingColor ?? Colors.white,
                    ),
                  ),
                )
              : Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (widget.showIcon) ...[
                      widget.icon ?? _defaultIcon,
                      const SizedBox(width: 8),
                    ],
                    Text(
                      _buttonText,
                      style: widget.textStyle ??
                          const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                  ],
                ),
        );
      },
    );
  }

  Widget get _defaultIcon {
    return const Icon(
      Icons.payment,
      size: 20,
    );
  }
}

/// A styled payment button with preset designs
class PresetPaymentButton extends StatelessWidget {
  final PaymentConfig config;
  final PaymentRequest request;
  final PaymentButtonStyle presetStyle;
  final PaymentSuccessCallback? onSuccess;
  final PaymentErrorCallback? onError;

  const PresetPaymentButton({
    super.key,
    required this.config,
    required this.request,
    this.presetStyle = PaymentButtonStyle.primary,
    this.onSuccess,
    this.onError,
  });

  @override
  Widget build(BuildContext context) {
    return PaymentButton(
      config: config,
      request: request,
      onSuccess: onSuccess,
      onError: onError,
      style: _getStyle(),
    );
  }

  ButtonStyle _getStyle() {
    switch (presetStyle) {
      case PaymentButtonStyle.primary:
        return ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF00A86B),
          foregroundColor: Colors.white,
        );
      case PaymentButtonStyle.secondary:
        return ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF007BFF),
          foregroundColor: Colors.white,
        );
      case PaymentButtonStyle.outline:
        return OutlinedButton.styleFrom(
          foregroundColor: const Color(0xFF00A86B),
          side: const BorderSide(color: Color(0xFF00A86B)),
        );
      case PaymentButtonStyle.dark:
        return ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF1A1A1A),
          foregroundColor: Colors.white,
        );
    }
  }
}

/// Preset button styles
enum PaymentButtonStyle {
  primary,
  secondary,
  outline,
  dark,
}
