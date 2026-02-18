import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/payment_config.dart';
import '../models/payment_request.dart';
import '../models/payment_response.dart';
import '../services/payment_service.dart';
import 'payment_button.dart';

/// A bottom sheet widget for payment collection
class PaymentSheet extends StatefulWidget {
  /// Payment configuration
  final PaymentConfig config;

  /// Amount to charge
  final double amount;

  /// Currency code
  final String currency;

  /// Order reference
  final String reference;

  /// Payment description
  final String? description;

  /// Title of the sheet
  final String? title;

  /// Called when payment succeeds
  final PaymentSuccessCallback? onSuccess;

  /// Called when payment fails
  final PaymentErrorCallback? onError;

  /// Called when sheet is dismissed
  final VoidCallback? onDismiss;

  /// Custom theme data
  final ThemeData? theme;

  const PaymentSheet({
    super.key,
    required this.config,
    required this.amount,
    required this.currency,
    required this.reference,
    this.description,
    this.title,
    this.onSuccess,
    this.onError,
    this.onDismiss,
    this.theme,
  });

  /// Show the payment sheet
  static Future<void> show({
    required BuildContext context,
    required PaymentConfig config,
    required double amount,
    required String currency,
    required String reference,
    String? description,
    String? title,
    PaymentSuccessCallback? onSuccess,
    PaymentErrorCallback? onError,
    ThemeData? theme,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => PaymentSheet(
        config: config,
        amount: amount,
        currency: currency,
        reference: reference,
        description: description,
        title: title,
        onSuccess: onSuccess,
        onError: onError,
        theme: theme,
      ),
    );
  }

  @override
  State<PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends State<PaymentSheet> {
  final _phoneController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;
  PaymentResponse? _response;
  String? _error;
  late PaymentService _service;

  @override
  void initState() {
    super.initState();
    _service = PaymentService();
    _initialize();
  }

  Future<void> _initialize() async {
    try {
      await _service.initialize(widget.config);
    } catch (e) {
      setState(() {
        _error = 'Failed to initialize payment service';
      });
    }
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _service.dispose();
    super.dispose();
  }

  Future<void> _handlePayment() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final request = PaymentRequest(
        amount: widget.amount,
        currency: widget.currency,
        phoneNumber: _phoneController.text,
        reference: widget.reference,
        description: widget.description,
      );

      final response = await _service.initiatePayment(request);

      setState(() {
        _response = response;
        _isLoading = false;
      });

      if (response.isSuccess) {
        widget.onSuccess?.call(response);
        await Future.delayed(const Duration(seconds: 2));
        if (mounted) Navigator.pop(context);
      }
    } on PaymentException catch (e) {
      setState(() {
        _error = e.message;
        _isLoading = false;
      });
      widget.onError?.call(e.message);
    } catch (e) {
      setState(() {
        _error = 'An unexpected error occurred';
        _isLoading = false;
      });
      widget.onError?.call('An unexpected error occurred');
    }
  }

  void _dismiss() {
    widget.onDismiss?.call();
    Navigator.pop(context);
  }

  String? _validatePhone(String? value) {
    if (value == null || value.isEmpty) {
      return 'Please enter your phone number';
    }
    final digits = value.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 9 || digits.length > 12) {
      return 'Please enter a valid phone number';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final theme = widget.theme ?? Theme.of(context);

    return Theme(
      data: theme,
      child: DraggableScrollableSheet(
        initialChildSize: 0.7,
        minChildSize: 0.5,
        maxChildSize: 0.9,
        builder: (context, scrollController) {
          return Container(
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: Column(
              children: [
                // Handle bar
                Container(
                  margin: const EdgeInsets.symmetric(vertical: 12),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),

                // Header
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        widget.title ?? 'Complete Payment',
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: _dismiss,
                      ),
                    ],
                  ),
                ),

                const Divider(),

                // Content
                Expanded(
                  child: SingleChildScrollView(
                    controller: scrollController,
                    padding: const EdgeInsets.all(20),
                    child: _buildContent(),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildContent() {
    // Success state
    if (_response?.isSuccess ?? false) {
      return _buildSuccessView();
    }

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Amount display
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.grey[50],
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              children: [
                Text(
                  'Amount to Pay',
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[600],
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${widget.currency} ${widget.amount.toStringAsFixed(2)}',
                  style: const TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                if (widget.description != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    widget.description!,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ],
            ),
          ),

          const SizedBox(height: 24),

          // Status message
          if (_response?.isPending ?? false)
            _buildStatusMessage(
              'Please check your phone and enter your PIN to complete the payment.',
              Colors.blue,
            ),

          // Error message
          if (_error != null)
            _buildStatusMessage(_error!, Colors.red),

          const SizedBox(height: 16),

          // Phone number input
          TextFormField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            enabled: !_isLoading,
            decoration: InputDecoration(
              labelText: 'Phone Number',
              hintText: 'e.g., 254712345678',
              prefixIcon: const Icon(Icons.phone),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
              helperText: 'Enter your M-Pesa or mobile money number',
            ),
            validator: _validatePhone,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(12),
            ],
          ),

          const SizedBox(height: 24),

          // Pay button
          ElevatedButton(
            onPressed: _isLoading ? null : _handlePayment,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF00A86B),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: _isLoading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation(Colors.white),
                    ),
                  )
                : Text(
                    'Pay ${widget.currency} ${widget.amount.toStringAsFixed(2)}',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
          ),

          const SizedBox(height: 16),

          // Security note
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.lock, size: 14, color: Colors.grey[500]),
              const SizedBox(width: 4),
              Text(
                'Secure payment powered by Africa Payments',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey[500],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatusMessage(String message, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        message,
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w500,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }

  Widget _buildSuccessView() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const SizedBox(height: 40),
        Container(
          width: 80,
          height: 80,
          decoration: const BoxDecoration(
            color: Color(0xFF00A86B),
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.check,
            color: Colors.white,
            size: 40,
          ),
        ),
        const SizedBox(height: 24),
        const Text(
          'Payment Successful!',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Transaction ID: ${_response?.transactionId ?? ''}',
          style: TextStyle(
            fontSize: 14,
            color: Colors.grey[600],
          ),
        ),
        const SizedBox(height: 40),
        ElevatedButton(
          onPressed: _dismiss,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF00A86B),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 16),
          ),
          child: const Text('Done'),
        ),
      ],
    );
  }
}
