/**
 * Africa Payments MCP - Webhook Module
 * Exports all webhook handling functionality
 */

// Event System
export {
  PaymentEventEmitter,
  PaymentEventData,
  PaymentEventType,
  WebhookEvent,
  WebhookReceivedHandler,
  PaymentEventHandler,
  getGlobalEventEmitter,
  setGlobalEventEmitter,
  mapStatusToEventType,
  createEventId,
} from './events.js';

// Verification Utilities
export {
  WebhookVerifier,
  VerificationResult,
  MpesaCallbackMetadata,
  MpesaStkCallback,
  getGlobalVerifier,
} from './verifier.js';

// Server
export {
  WebhookServer,
  WebhookServerConfig,
  WebhookLogEntry,
  createWebhookServer,
  createWebhookMiddleware,
} from './server.js';

// Handler Types
export type {
  MpesaStkPushCallback,
  MpesaC2BCallback,
  MpesaB2CCallback,
  MpesaReversalCallback,
} from './handlers/mpesa.js';

export type {
  PaystackWebhookPayload,
  PaystackEventType,
  PaystackChargeData,
  PaystackTransferData,
  PaystackRefundData,
} from './handlers/paystack.js';

export type {
  MTNMoMoPaymentNotification,
  MTNMoMoRequestToPayNotification,
  MTNMoMoTransferNotification,
  MTNMoMoCollectionCallback,
} from './handlers/mtn-momo.js';

export type {
  IntaSendEventType,
  IntaSendPaymentNotification,
  IntaSendPayoutNotification,
  IntaSendRefundNotification,
  IntaSendWalletNotification,
} from './handlers/intasend.js';

export type {
  OrangeMoneyPaymentCallback,
  OrangeMoneyTransferCallback,
  OrangeMoneyRefundCallback,
} from './handlers/orange-money.js';

export type {
  ChipperCashWebhookPayload,
  ChipperCashEventType,
  ChipperCashTransferData,
  ChipperCashPaymentRequestData,
  ChipperCashRefundData,
} from './handlers/chipper-cash.js';

export type {
  WaveWebhookPayload,
  WaveEventType,
  WavePaymentData,
  WaveTransferData,
  WaveRefundData,
} from './handlers/wave.js';

// Crypto Handler Types
export type {
  LightningInvoiceSettledEvent,
  LightningPaymentSentEvent,
  LndInvoiceEvent,
} from './handlers/bitcoin-lightning.js';

export type {
  StellarPaymentEvent,
  AnchorTransactionEvent,
  StellarEffectEvent,
} from './handlers/usdc-stellar.js';

export type {
  CeloTransferEvent,
  CeloContractEvent,
  CeloBlockscoutWebhook,
  ValoraPaymentNotification,
} from './handlers/celo.js';

export type {
  KotaniPayWebhookEvent,
  YellowCardWebhookEvent,
  BridgePaymentNotification,
} from './handlers/mpesa-crypto-bridge.js';

// Handler Classes
export { MpesaWebhookHandler, createMpesaWebhookHandler } from './handlers/mpesa.js';
export { PaystackWebhookHandler, createPaystackWebhookHandler } from './handlers/paystack.js';
export { MTNMoMoWebhookHandler, createMTNMoMoWebhookHandler } from './handlers/mtn-momo.js';
export { IntaSendWebhookHandler, createIntaSendWebhookHandler } from './handlers/intasend.js';
export { OrangeMoneyWebhookHandler, createOrangeMoneyWebhookHandler } from './handlers/orange-money.js';
export { ChipperCashWebhookHandler, createChipperCashWebhookHandler } from './handlers/chipper-cash.js';
export { WaveWebhookHandler, createWaveWebhookHandler } from './handlers/wave.js';

// Crypto Handler Classes
export { BitcoinLightningWebhookHandler, createBitcoinLightningWebhookHandler } from './handlers/bitcoin-lightning.js';
export { UsdcStellarWebhookHandler, createUsdcStellarWebhookHandler } from './handlers/usdc-stellar.js';
export { CeloWebhookHandler, createCeloWebhookHandler } from './handlers/celo.js';
export { MpesaCryptoBridgeWebhookHandler, createMpesaCryptoBridgeWebhookHandler } from './handlers/mpesa-crypto-bridge.js';
