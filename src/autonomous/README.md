# Autonomous Operations Module

The Autonomous Operations module for Africa Payments MCP provides self-healing, auto-scaling, predictive maintenance, and auto-optimization capabilities.

## Features

### 🩺 Self-Healing System (`self-healer.ts`)

Monitors provider health and automatically heals the system without human intervention:

- **Provider Health Monitoring**: Continuously monitors all payment providers
- **Auto-Restart**: Automatically restarts failing providers
- **Circuit Breaker Auto-Reset**: Resets circuit breakers when providers recover
- **Automatic Failover**: Switches to backup providers when primary fails
- **Recovery Tracking**: Tracks healing attempts and success rates

```typescript
import { SelfHealer, getGlobalSelfHealer } from './autonomous/index.js';

const selfHealer = getGlobalSelfHealer(healthMonitor, circuitBreakerRegistry);
selfHealer.start();

// Register a provider with backup providers
selfHealer.registerProvider('mpesa');
selfHealer.setBackupProviders('mpesa', ['intasend', 'paystack']);
```

### 📈 Auto-Scaling System (`auto-scaler.ts`)

Automatically scales the system based on transaction volume:

- **Transaction Volume Monitoring**: Monitors real-time transaction rates
- **Scale Up**: Increases instances when load increases
- **Scale Down**: Reduces instances during quiet periods
- **Kubernetes HPA Integration**: Native Kubernetes support
- **Cost Optimization**: Prefers scaling down to save costs
- **Predictive Scaling**: Uses known traffic patterns

```typescript
import { AutoScaler, getGlobalAutoScaler } from './autonomous/index.js';

const autoScaler = new AutoScaler({
  minInstances: 2,
  maxInstances: 20,
  targetTransactionsPerInstance: 100,
  scaleProvider: 'kubernetes',
  k8sNamespace: 'production',
  k8sDeployment: 'africa-payments-mcp',
});

autoScaler.start();
```

### 🔮 Predictive Maintenance (`predictor.ts`)

Predicts failures before they happen:

- **Error Rate Trend Analysis**: Detects increasing error rates
- **Response Time Degradation**: Identifies performance degradation
- **Pattern Anomaly Detection**: Spots unusual patterns
- **Automatic Maintenance Scheduling**: Schedules maintenance during low-traffic periods
- **Confidence Scoring**: Predictions include confidence levels

```typescript
import { PredictiveMaintenance, getGlobalPredictor } from './autonomous/index.js';

const predictor = new PredictiveMaintenance(healthMonitor, circuitBreakerRegistry, {
  sensitivity: 'high',
  autoScheduleMaintenance: true,
});

predictor.start();

// Get active predictions
const predictions = predictor.getActivePredictions();
```

### ⚡ Auto-Optimization (`optimizer.ts`)

Automatically optimizes provider configurations:

- **Retry Logic Tuning**: Adjusts retry attempts based on success rates
- **Timeout Optimization**: Optimizes timeouts per provider
- **Rate Limit Adjustment**: Dynamically adjusts rate limits
- **Cache Optimization**: Tunes cache TTL based on hit rates
- **Performance Tracking**: Measures improvement from optimizations

```typescript
import { AutoOptimizer, getGlobalOptimizer } from './autonomous/index.js';

const optimizer = new AutoOptimizer(healthMonitor, circuitBreakerRegistry);
optimizer.start();

// Register providers for optimization
optimizer.registerProvider('mpesa');
optimizer.registerProvider('paystack');
```

## Unified Autonomous System

Use the `AutonomousSystem` class to manage all autonomous operations:

```typescript
import { AutonomousSystem, getGlobalAutonomousSystem } from './autonomous/index.js';

const autonomous = new AutonomousSystem({
  selfHealing: true,
  autoScaling: true,
  predictiveMaintenance: true,
  autoOptimization: true,
});

await autonomous.initialize();
autonomous.start();

// Register providers
autonomous.registerProvider('mpesa', ['intasend', 'paystack']);
autonomous.registerProvider('paystack');

// Get comprehensive status
const status = autonomous.getStatus();
const stats = autonomous.getStats();
```

## Dashboard

A web-based dashboard is available at `tools/autonomous-dashboard.html` for monitoring:

- Real-time system health
- Self-healing events log
- Auto-scaling history
- Predictions and alerts
- Provider configurations
- Optimization results

Open the dashboard in any modern browser:
```bash
open tools/autonomous-dashboard.html
```

## Configuration

### Environment Variables

```bash
# Self-Healing
SELF_HEALING_ENABLED=true
SELF_HEALING_INTERVAL_MS=10000
MAX_HEALING_ATTEMPTS=5

# Auto-Scaling
AUTO_SCALING_ENABLED=true
MIN_INSTANCES=2
MAX_INSTANCES=20
TARGET_TPM_PER_INSTANCE=100

# Predictive Maintenance
PREDICTIVE_MAINTENANCE_ENABLED=true
PREDICTION_SENSITIVITY=medium
AUTO_SCHEDULE_MAINTENANCE=true

# Auto-Optimization
AUTO_OPTIMIZATION_ENABLED=true
OPTIMIZATION_INTERVAL_MS=120000
CONSERVATIVE_MODE=false
```

## Events

All autonomous components emit events for monitoring and integration:

```typescript
// Self-Healer events
selfHealer.on('healing_event', (event) => console.log('Healing:', event));
selfHealer.on('provider_recovered', (data) => console.log('Recovered:', data));
selfHealer.on('failover_triggered', (data) => console.log('Failover:', data));

// Auto-Scaler events
autoScaler.on('scaled_up', (data) => console.log('Scaled up:', data));
autoScaler.on('scaled_down', (data) => console.log('Scaled down:', data));

// Predictor events
predictor.on('prediction', (prediction) => console.log('Prediction:', prediction));
predictor.on('maintenance_scheduled', (window) => console.log('Maintenance:', window));

// Optimizer events
optimizer.on('optimization_applied', (opt) => console.log('Optimization:', opt));
```

## API Endpoints

When integrated with the MCP server, the following endpoints are available:

### GET /autonomous/status
Returns the current status of all autonomous systems.

### GET /autonomous/stats
Returns comprehensive statistics.

### POST /autonomous/heal/:provider
Force healing for a specific provider.

### POST /autonomous/scale
Force scaling to a specific instance count.

### GET /autonomous/predictions
Get active predictions.

### GET /autonomous/optimizations
Get optimization history.

## Testing

Run the autonomous system tests:

```bash
npm test -- tests/autonomous/
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Autonomous System                          │
├─────────────┬─────────────┬─────────────┬───────────────────┤
│ Self-Healer │ Auto-Scaler │  Predictor  │    Optimizer      │
├─────────────┴─────────────┴─────────────┴───────────────────┤
│              Health Monitor & Circuit Breaker                │
├─────────────────────────────────────────────────────────────┤
│                      Provider Adapters                       │
└─────────────────────────────────────────────────────────────┘
```

All autonomous components integrate with the existing Health Monitor and Circuit Breaker systems for a cohesive self-managing platform.
