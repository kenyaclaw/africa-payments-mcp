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

// Handler Classes
export { MpesaWebhookHandler, createMpesaWebhookHandler } from './handlers/mpesa.js';
export { PaystackWebhookHandler, createPaystackWebhookHandler } from './handlers/paystack.js';
export { MTNMoMoWebhookHandler, createMTNMoMoWebhookHandler } from './handlers/mtn-momo.js';
export { IntaSendWebhookHandler, createIntaSendWebhookHandler } from './handlers/intasend.js';
export { OrangeMoneyWebhookHandler, createOrangeMoneyWebhookHandler } from './handlers/orange-money.js';
export { ChipperCashWebhookHandler, createChipperCashWebhookHandler } from './handlers/chipper-cash.js';
export { WaveWebhookHandler, createWaveWebhookHandler } from './handlers/wave.js';
