import 'package:flutter/material.dart';
import 'package:africa_payments_mcp/africa_payments_mcp.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Africa Payments Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF00A86B)),
        useMaterial3: true,
      ),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  final config = const PaymentConfig(
    apiKey: 'demo-api-key',
    environment: PaymentEnvironment.sandbox,
    region: PaymentRegion.kenya,
  );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Africa Payments MCP'),
        backgroundColor: const Color(0xFF00A86B),
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildSection(
            context,
            '1. Simple Payment Button',
            PaymentButton(
              config: config,
              request: PaymentRequest(
                amount: 1000.0,
                currency: 'KES',
                phoneNumber: '254712345678',
                reference: 'ORDER-${DateTime.now().millisecondsSinceEpoch}',
                description: 'Test payment',
              ),
              title: 'Pay KES 1,000',
              onSuccess: (response) {
                _showSuccess(context, response);
              },
              onError: (error) {
                _showError(context, error);
              },
            ),
          ),
          _buildSection(
            context,
            '2. Payment Sheet',
            ElevatedButton(
              onPressed: () => _showPaymentSheet(context),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: const Text('Open Payment Sheet'),
            ),
          ),
          _buildSection(
            context,
            '3. Styled Buttons',
            Column(
              children: [
                PresetPaymentButton(
                  config: config,
                  request: PaymentRequest(
                    amount: 500.0,
                    currency: 'KES',
                    phoneNumber: '254712345678',
                    reference: 'ORDER-${DateTime.now().millisecondsSinceEpoch}',
                  ),
                  presetStyle: PaymentButtonStyle.secondary,
                  onSuccess: (response) {
                    _showSuccess(context, response);
                  },
                ),
                const SizedBox(height: 8),
                PresetPaymentButton(
                  config: config,
                  request: PaymentRequest(
                    amount: 1500.0,
                    currency: 'KES',
                    phoneNumber: '254712345678',
                    reference: 'ORDER-${DateTime.now().millisecondsSinceEpoch}',
                  ),
                  presetStyle: PaymentButtonStyle.outline,
                  onSuccess: (response) {
                    _showSuccess(context, response);
                  },
                ),
              ],
            ),
          ),
          _buildSection(
            context,
            '4. Transaction History',
            ElevatedButton(
              onPressed: () => _showTransactionHistory(context),
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
              ),
              child: const Text('View Transactions'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection(BuildContext context, String title, Widget child) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            const SizedBox(height: 16),
            child,
          ],
        ),
      ),
    );
  }

  void _showPaymentSheet(BuildContext context) {
    PaymentSheet.show(
      context: context,
      config: config,
      amount: 2500.0,
      currency: 'KES',
      reference: 'ORDER-${DateTime.now().millisecondsSinceEpoch}',
      description: 'Premium subscription payment',
      title: 'Complete Your Purchase',
      onSuccess: (response) {
        _showSuccess(context, response);
      },
      onError: (error) {
        _showError(context, error);
      },
    );
  }

  void _showTransactionHistory(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => TransactionHistoryPage(config: config),
      ),
    );
  }

  void _showSuccess(BuildContext context, PaymentResponse response) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Payment Successful'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Transaction ID: ${response.transactionId}'),
            Text('Reference: ${response.reference}'),
            Text('Amount: ${response.currency} ${response.amount}'),
            Text('Status: ${response.status.name}'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  void _showError(BuildContext context, String error) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Error: $error'),
        backgroundColor: Colors.red,
      ),
    );
  }
}

class TransactionHistoryPage extends StatefulWidget {
  final PaymentConfig config;

  const TransactionHistoryPage({super.key, required this.config});

  @override
  State<TransactionHistoryPage> createState() => _TransactionHistoryPageState();
}

class _TransactionHistoryPageState extends State<TransactionHistoryPage> {
  final PaymentService _service = PaymentService();
  TransactionHistory? _history;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  @override
  void dispose() {
    _service.dispose();
    super.dispose();
  }

  Future<void> _initialize() async {
    try {
      await _service.initialize(widget.config);
      _loadHistory();
    } catch (e) {
      setState(() {
        _error = 'Failed to initialize: $e';
      });
    }
  }

  Future<void> _loadHistory() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final history = await _service.getTransactionHistory(
        const TransactionQuery(limit: 20),
      );
      setState(() {
        _history = history;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Transaction History'),
        backgroundColor: const Color(0xFF00A86B),
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadHistory,
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('Error: $_error'),
            ElevatedButton(
              onPressed: _loadHistory,
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (_history == null || _history!.transactions.isEmpty) {
      return const Center(
        child: Text('No transactions found'),
      );
    }

    return ListView.builder(
      itemCount: _history!.transactions.length,
      itemBuilder: (context, index) {
        final tx = _history!.transactions[index];
        return ListTile(
          leading: _getStatusIcon(tx.status),
          title: Text(tx.reference),
          subtitle: Text(tx.phoneNumber),
          trailing: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${tx.currency} ${tx.amount.toStringAsFixed(2)}',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              Text(
                tx.status.name.toUpperCase(),
                style: TextStyle(
                  fontSize: 12,
                  color: _getStatusColor(tx.status),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _getStatusIcon(PaymentStatus status) {
    IconData icon;
    Color color;

    switch (status) {
      case PaymentStatus.success:
        icon = Icons.check_circle;
        color = Colors.green;
        break;
      case PaymentStatus.pending:
        icon = Icons.pending;
        color = Colors.orange;
        break;
      case PaymentStatus.failed:
        icon = Icons.error;
        color = Colors.red;
        break;
      case PaymentStatus.cancelled:
        icon = Icons.cancel;
        color = Colors.grey;
        break;
    }

    return Icon(icon, color: color);
  }

  Color _getStatusColor(PaymentStatus status) {
    switch (status) {
      case PaymentStatus.success:
        return Colors.green;
      case PaymentStatus.pending:
        return Colors.orange;
      case PaymentStatus.failed:
        return Colors.red;
      case PaymentStatus.cancelled:
        return Colors.grey;
    }
  }
}
