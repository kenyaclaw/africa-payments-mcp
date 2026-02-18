/**
 * Push Notifications Service
 * Supports Firebase Cloud Messaging, OneSignal, SendGrid (email), and SMS (Twilio/Africa's Talking)
 */

import { ILogger, StructuredLogger } from '../utils/structured-logger.js';
import { Transaction, TransactionStatus } from '../types/index.js';

// ==================== Configuration Types ====================

export interface NotificationsConfig {
  /** Firebase Cloud Messaging configuration */
  fcm?: FCMConfig;
  /** OneSignal configuration */
  oneSignal?: OneSignalConfig;
  /** SendGrid email configuration */
  sendgrid?: SendGridConfig;
  /** Twilio SMS configuration */
  twilio?: TwilioConfig;
  /** Africa's Talking SMS configuration */
  africasTalking?: AfricasTalkingConfig;
  /** General notification settings */
  general?: GeneralNotificationConfig;
}

export interface FCMConfig {
  /** Firebase project ID */
  projectId: string;
  /** Path to service account JSON file or the JSON content */
  serviceAccount: string | object;
  /** Default notification icon */
  defaultIcon?: string;
  /** Default notification color */
  defaultColor?: string;
  /** Enable notification sound */
  defaultSound?: boolean;
}

export interface OneSignalConfig {
  /** OneSignal App ID */
  appId: string;
  /** REST API Key */
  apiKey: string;
  /** Default URL for web push notifications */
  defaultUrl?: string;
}

export interface SendGridConfig {
  /** SendGrid API Key */
  apiKey: string;
  /** Default from email */
  fromEmail: string;
  /** Default from name */
  fromName?: string;
  /** Reply-to email */
  replyTo?: string;
  /** Enable click tracking */
  clickTracking?: boolean;
  /** Enable open tracking */
  openTracking?: boolean;
}

export interface TwilioConfig {
  /** Account SID */
  accountSid: string;
  /** Auth Token */
  authToken: string;
  /** From phone number (E.164 format) */
  fromNumber: string;
  /** Messaging Service SID (optional) */
  messagingServiceSid?: string;
  /** Enable status callbacks */
  statusCallback?: string;
}

export interface AfricasTalkingConfig {
  /** Username */
  username: string;
  /** API Key */
  apiKey: string;
  /** From sender ID (optional, max 11 chars) */
  from?: string;
  /** Environment: sandbox or production */
  environment?: 'sandbox' | 'production';
}

export interface GeneralNotificationConfig {
  /** Default country code for phone numbers */
  defaultCountryCode?: string;
  /** Retry attempts for failed notifications */
  retryAttempts?: number;
  /** Retry delay in ms */
  retryDelayMs?: number;
  /** Enable batch sending for SMS */
  batchEnabled?: boolean;
  /** Batch size */
  batchSize?: number;
  /** Batch interval in ms */
  batchIntervalMs?: number;
}

// ==================== Notification Types ====================

export type NotificationChannel = 'push' | 'email' | 'sms' | 'webhook';
export type NotificationPriority = 'high' | 'normal' | 'low';

export interface NotificationRecipient {
  /** User ID */
  userId: string;
  /** Tenant ID */
  tenantId?: string;
  /** Email address (for email notifications) */
  email?: string;
  /** Phone number in E.164 format (for SMS) */
  phoneNumber?: string;
  /** FCM device tokens */
  fcmTokens?: string[];
  /** OneSignal player IDs */
  oneSignalPlayerIds?: string[];
  /** Preferred language */
  language?: string;
  /** User preferences */
  preferences?: {
    emailEnabled?: boolean;
    pushEnabled?: boolean;
    smsEnabled?: boolean;
    [key: string]: boolean | undefined;
  };
}

export interface NotificationPayload {
  /** Unique notification ID */
  id: string;
  /** Notification title */
  title: string;
  /** Notification body/message */
  body: string;
  /** Notification type/category */
  type: string;
  /** Priority level */
  priority: NotificationPriority;
  /** Associated transaction */
  transaction?: Transaction;
  /** Deep link/URL */
  url?: string;
  /** Additional data */
  data?: Record<string, unknown>;
  /** Image URL (for rich notifications) */
  imageUrl?: string;
  /** Action buttons */
  actions?: NotificationAction[];
}

export interface NotificationAction {
  /** Action ID */
  id: string;
  /** Action title */
  title: string;
  /** Action URL */
  url?: string;
  /** Action icon (Android) */
  icon?: string;
}

export interface NotificationResult {
  /** Whether the notification was sent successfully */
  success: boolean;
  /** Notification ID */
  notificationId: string;
  /** Channel used */
  channel: NotificationChannel;
  /** Provider used (e.g., 'fcm', 'onesignal', 'sendgrid', 'twilio', 'africastalking') */
  provider: string;
  /** Timestamp */
  timestamp: Date;
  /** Error message (if failed) */
  error?: string;
  /** Provider-specific response */
  providerResponse?: unknown;
  /** Number of recipients reached */
  recipientCount?: number;
}

export interface NotificationTemplate {
  /** Template ID */
  id: string;
  /** Template name */
  name: string;
  /** Supported channels */
  channels: NotificationChannel[];
  /** Translations */
  translations: Record<string, {
    title: string;
    body: string;
  }>;
  /** Default data values */
  defaultData?: Record<string, unknown>;
}

// ==================== Notification Service Interface ====================

export interface INotificationService {
  /** Initialize the service */
  initialize(): Promise<void>;
  /** Send a notification to a recipient */
  send(
    recipient: NotificationRecipient,
    payload: NotificationPayload,
    channels?: NotificationChannel[]
  ): Promise<NotificationResult[]>;
  /** Send batch notifications */
  sendBatch(
    recipients: NotificationRecipient[],
    payload: NotificationPayload,
    channels?: NotificationChannel[]
  ): Promise<NotificationResult[]>;
  /** Register a device token */
  registerDevice(userId: string, token: string, platform: 'ios' | 'android' | 'web'): Promise<void>;
  /** Unregister a device token */
  unregisterDevice(userId: string, token: string): Promise<void>;
  /** Check health of all providers */
  healthCheck(): Promise<Record<string, boolean>>;
}

// ==================== Firebase Cloud Messaging Provider ====================

interface FCMModule {
  cert: {
    cert(serviceAccount: string | object): unknown;
  };
  initializeApp(config: { credential: unknown; projectId: string }): FCMApp;
}

interface FCMApp {
  messaging(): FCMMessaging;
}

interface FCMMessaging {
  send(message: FCMMessage): Promise<string>;
  sendMulticast(message: FMCMulticastMessage): Promise<FCMMulticastResponse>;
  sendToDevice(tokens: string | string[], payload: FCMPayload): Promise<FCMDeviceResponse>;
}

interface FCMMessage {
  token?: string;
  tokens?: string[];
  notification?: {
    title: string;
    body: string;
    imageUrl?: string;
  };
  data?: Record<string, string>;
  android?: {
    priority: 'high' | 'normal';
    notification?: {
      channelId?: string;
      sound?: string;
      icon?: string;
      color?: string;
    };
  };
  apns?: {
    payload: {
      aps: {
        alert: {
          title: string;
          body: string;
        };
        sound?: string;
        badge?: number;
      };
    };
  };
  webpush?: {
    notification?: {
      title: string;
      body: string;
      icon?: string;
      badge?: string;
      actions?: { action: string; title: string; icon?: string }[];
    };
    data?: Record<string, string>;
  };
}

interface FMCMulticastMessage extends Omit<FCMMessage, 'token'> {
  tokens: string[];
}

interface FCMPayload {
  notification?: {
    title: string;
    body: string;
    imageUrl?: string;
  };
  data?: Record<string, string>;
}

interface FCMMulticastResponse {
  successCount: number;
  failureCount: number;
  responses: Array<{ success: boolean; messageId?: string; error?: Error }>;
}

interface FCMDeviceResponse {
  successCount: number;
  failureCount: number;
  results: Array<{ messageId?: string; error?: Error }>;
}

class FCMProvider {
  private app: FCMApp | null = null;
  private config: FCMConfig;
  private logger: ILogger;
  private deviceTokens: Map<string, Set<string>> = new Map(); // userId -> tokens

  constructor(config: FCMConfig, logger: ILogger) {
    this.config = config;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    try {
      const admin = await import('firebase-admin');
      
      const credential = admin.credential.cert(this.config.serviceAccount);
      
      this.app = admin.initializeApp({
        credential,
        projectId: this.config.projectId,
      }, `fcm-${Date.now()}`);

      this.logger.info('🔥 Firebase Cloud Messaging initialized');
    } catch (error) {
      this.logger.error('Failed to initialize FCM', { error: (error as Error).message });
      throw error;
    }
  }

  async send(recipient: NotificationRecipient, payload: NotificationPayload): Promise<NotificationResult> {
    if (!this.app) {
      throw new Error('FCM not initialized');
    }

    const tokens = recipient.fcmTokens || Array.from(this.deviceTokens.get(recipient.userId) || []);
    
    if (tokens.length === 0) {
      return {
        success: false,
        notificationId: payload.id,
        channel: 'push',
        provider: 'fcm',
        timestamp: new Date(),
        error: 'No FCM tokens available for recipient',
      };
    }

    try {
      const message: FCMMessage = {
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
        },
        data: this.sanitizeData(payload.data),
        android: {
          priority: payload.priority === 'high' ? 'high' : 'normal',
          notification: {
            channelId: 'payment_notifications',
            sound: this.config.defaultSound ? 'default' : undefined,
            icon: this.config.defaultIcon,
            color: this.config.defaultColor,
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: payload.title,
                body: payload.body,
              },
              sound: this.config.defaultSound ? 'default' : undefined,
            },
          },
        },
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body,
            icon: this.config.defaultIcon,
            actions: payload.actions?.map(a => ({ action: a.id, title: a.title, icon: a.icon })),
          },
          data: this.sanitizeData(payload.data),
        },
      };

      let response: FCMMulticastResponse | FCMDeviceResponse;
      
      if (tokens.length === 1) {
        message.token = tokens[0];
        const msgId = await this.app.messaging().send(message);
        response = {
          successCount: 1,
          failureCount: 0,
          responses: [{ success: true, messageId: msgId }],
        } as FCMMulticastResponse;
      } else {
        response = await this.app.messaging().sendMulticast({ ...message, tokens });
      }

      // Remove invalid tokens
      response.responses.forEach((resp, index) => {
        if (!resp.success && this.isInvalidTokenError(resp.error)) {
          this.unregisterDevice(recipient.userId, tokens[index]);
        }
      });

      return {
        success: response.successCount > 0,
        notificationId: payload.id,
        channel: 'push',
        provider: 'fcm',
        timestamp: new Date(),
        recipientCount: response.successCount,
        providerResponse: response,
      };
    } catch (error) {
      this.logger.error('FCM send error', { error: (error as Error).message });
      return {
        success: false,
        notificationId: payload.id,
        channel: 'push',
        provider: 'fcm',
        timestamp: new Date(),
        error: (error as Error).message,
      };
    }
  }

  async registerDevice(userId: string, token: string): Promise<void> {
    const tokens = this.deviceTokens.get(userId) || new Set();
    tokens.add(token);
    this.deviceTokens.set(userId, tokens);
    this.logger.debug('FCM device registered', { userId, token: token.substring(0, 10) + '...' });
  }

  async unregisterDevice(userId: string, token: string): Promise<void> {
    const tokens = this.deviceTokens.get(userId);
    if (tokens) {
      tokens.delete(token);
      if (tokens.size === 0) {
        this.deviceTokens.delete(userId);
      }
    }
    this.logger.debug('FCM device unregistered', { userId, token: token.substring(0, 10) + '...' });
  }

  private sanitizeData(data?: Record<string, unknown>): Record<string, string> {
    if (!data) return {};
    
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        sanitized[key] = typeof value === 'string' ? value : JSON.stringify(value);
      }
    }
    return sanitized;
  }

  private isInvalidTokenError(error?: Error): boolean {
    if (!error) return false;
    const invalidTokenErrors = ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'];
    return invalidTokenErrors.some(err => error.message.includes(err));
  }
}

// ==================== OneSignal Provider ====================

interface OneSignalNotification {
  app_id: string;
  include_player_ids?: string[];
  include_external_user_ids?: string[];
  headings?: Record<string, string>;
  contents?: Record<string, string>;
  data?: Record<string, unknown>;
  url?: string;
  big_picture?: string;
  buttons?: Array<{ id: string; text: string; icon?: string }>;
  priority?: number;
  content_available?: boolean;
  mutable_content?: boolean;
}

class OneSignalProvider {
  private config: OneSignalConfig;
  private logger: ILogger;
  private apiBaseUrl = 'https://onesignal.com/api/v1';

  constructor(config: OneSignalConfig, logger: ILogger) {
    this.config = config;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    this.logger.info('📱 OneSignal initialized');
  }

  async send(recipient: NotificationRecipient, payload: NotificationPayload): Promise<NotificationResult> {
    const playerIds = recipient.oneSignalPlayerIds || [];
    
    if (playerIds.length === 0 && !recipient.userId) {
      return {
        success: false,
        notificationId: payload.id,
        channel: 'push',
        provider: 'onesignal',
        timestamp: new Date(),
        error: 'No OneSignal player IDs available for recipient',
      };
    }

    try {
      const notification: OneSignalNotification = {
        app_id: this.config.appId,
        headings: { en: payload.title },
        contents: { en: payload.body },
        data: payload.data,
        url: payload.url || this.config.defaultUrl,
        big_picture: payload.imageUrl,
        buttons: payload.actions?.map(a => ({ id: a.id, text: a.title, icon: a.icon })),
        priority: payload.priority === 'high' ? 10 : 5,
        content_available: true,
        mutable_content: true,
      };

      if (playerIds.length > 0) {
        notification.include_player_ids = playerIds;
      } else {
        notification.include_external_user_ids = [recipient.userId];
      }

      const response = await fetch(`${this.apiBaseUrl}/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.config.apiKey}`,
        },
        body: JSON.stringify(notification),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OneSignal API error: ${error}`);
      }

      const result = await response.json();

      return {
        success: true,
        notificationId: payload.id,
        channel: 'push',
        provider: 'onesignal',
        timestamp: new Date(),
        recipientCount: result.recipients || 0,
        providerResponse: result,
      };
    } catch (error) {
      this.logger.error('OneSignal send error', { error: (error as Error).message });
      return {
        success: false,
        notificationId: payload.id,
        channel: 'push',
        provider: 'onesignal',
        timestamp: new Date(),
        error: (error as Error).message,
      };
    }
  }
}

// ==================== SendGrid Email Provider ====================

interface SendGridModule {
  setApiKey(key: string): void;
  send(data: SendGridEmailData): Promise<[SendGridResponse, unknown]>;
}

interface SendGridEmailData {
  to: string | string[] | { email: string; name?: string };
  from: { email: string; name?: string };
  replyTo?: { email: string; name?: string };
  subject: string;
  text?: string;
  html?: string;
  templateId?: string;
  dynamicTemplateData?: Record<string, unknown>;
  trackingSettings?: {
    clickTracking?: { enable: boolean };
    openTracking?: { enable: boolean };
  };
}

interface SendGridResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}

class SendGridProvider {
  private sgMail: SendGridModule | null = null;
  private config: SendGridConfig;
  private logger: ILogger;

  constructor(config: SendGridConfig, logger: ILogger) {
    this.config = config;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    try {
      const sendgrid = await import('@sendgrid/mail');
      this.sgMail = sendgrid as unknown as SendGridModule;
      this.sgMail.setApiKey(this.config.apiKey);
      this.logger.info('📧 SendGrid initialized');
    } catch (error) {
      this.logger.error('Failed to initialize SendGrid', { error: (error as Error).message });
      throw error;
    }
  }

  async send(recipient: NotificationRecipient, payload: NotificationPayload): Promise<NotificationResult> {
    if (!recipient.email) {
      return {
        success: false,
        notificationId: payload.id,
        channel: 'email',
        provider: 'sendgrid',
        timestamp: new Date(),
        error: 'No email address available for recipient',
      };
    }

    if (!this.sgMail) {
      throw new Error('SendGrid not initialized');
    }

    try {
      const msg: SendGridEmailData = {
        to: recipient.email,
        from: {
          email: this.config.fromEmail,
          name: this.config.fromName || 'Africa Payments',
        },
        subject: payload.title,
        text: payload.body,
        html: this.formatHtmlEmail(payload),
        trackingSettings: {
          clickTracking: { enable: this.config.clickTracking ?? true },
          openTracking: { enable: this.config.openTracking ?? true },
        },
      };

      if (this.config.replyTo) {
        msg.replyTo = {
          email: this.config.replyTo,
          name: this.config.fromName || 'Africa Payments',
        };
      }

      const [response] = await this.sgMail.send(msg);

      return {
        success: response.statusCode >= 200 && response.statusCode < 300,
        notificationId: payload.id,
        channel: 'email',
        provider: 'sendgrid',
        timestamp: new Date(),
        recipientCount: 1,
        providerResponse: response,
      };
    } catch (error) {
      this.logger.error('SendGrid send error', { error: (error as Error).message });
      return {
        success: false,
        notificationId: payload.id,
        channel: 'email',
        provider: 'sendgrid',
        timestamp: new Date(),
        error: (error as Error).message,
      };
    }
  }

  private formatHtmlEmail(payload: NotificationPayload): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${payload.title}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 5px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .button { display: inline-block; padding: 10px 20px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${payload.title}</h1>
            </div>
            <div class="content">
              <p>${payload.body}</p>
              ${payload.url ? `<p><a href="${payload.url}" class="button">View Details</a></p>` : ''}
              ${payload.transaction ? `
                <hr>
                <h3>Transaction Details</h3>
                <p><strong>Amount:</strong> ${payload.transaction.amount.amount} ${payload.transaction.amount.currency}</p>
                <p><strong>Status:</strong> ${payload.transaction.status}</p>
                <p><strong>Reference:</strong> ${payload.transaction.id}</p>
              ` : ''}
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} Africa Payments. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}

// ==================== Twilio SMS Provider ====================

interface TwilioModule {
  (accountSid: string, authToken: string): TwilioClient;
}

interface TwilioClient {
  messages: TwilioMessages;
}

interface TwilioMessages {
  create(options: {
    body: string;
    from?: string;
    to: string;
    messagingServiceSid?: string;
    statusCallback?: string;
  }): Promise<TwilioMessageResponse>;
}

interface TwilioMessageResponse {
  sid: string;
  status: string;
  errorCode?: string;
  errorMessage?: string;
}

class TwilioProvider {
  private client: TwilioClient | null = null;
  private config: TwilioConfig;
  private logger: ILogger;

  constructor(config: TwilioConfig, logger: ILogger) {
    this.config = config;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    try {
      const twilio = (await import('twilio')).default as unknown as TwilioModule;
      this.client = twilio(this.config.accountSid, this.config.authToken);
      this.logger.info('📲 Twilio SMS initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Twilio', { error: (error as Error).message });
      throw error;
    }
  }

  async send(recipient: NotificationRecipient, payload: NotificationPayload): Promise<NotificationResult> {
    if (!recipient.phoneNumber) {
      return {
        success: false,
        notificationId: payload.id,
        channel: 'sms',
        provider: 'twilio',
        timestamp: new Date(),
        error: 'No phone number available for recipient',
      };
    }

    if (!this.client) {
      throw new Error('Twilio not initialized');
    }

    try {
      const message = await this.client.messages.create({
        body: `${payload.title}\n\n${payload.body}${payload.url ? `\n\n${payload.url}` : ''}`,
        from: this.config.messagingServiceSid ? undefined : this.config.fromNumber,
        messagingServiceSid: this.config.messagingServiceSid,
        to: recipient.phoneNumber,
        statusCallback: this.config.statusCallback,
      });

      return {
        success: !message.errorCode,
        notificationId: payload.id,
        channel: 'sms',
        provider: 'twilio',
        timestamp: new Date(),
        recipientCount: 1,
        providerResponse: message,
        error: message.errorMessage,
      };
    } catch (error) {
      this.logger.error('Twilio send error', { error: (error as Error).message });
      return {
        success: false,
        notificationId: payload.id,
        channel: 'sms',
        provider: 'twilio',
        timestamp: new Date(),
        error: (error as Error).message,
      };
    }
  }
}

// ==================== Africa's Talking SMS Provider ====================

interface ATModule {
  (config: { username: string; apiKey: string }): ATClient;
}

interface ATClient {
  SMS: ATSMS;
}

interface ATSMS {
  send(options: {
    to: string[];
    message: string;
    from?: string;
    enqueue?: boolean;
  }): Promise<ATSendResponse>;
}

interface ATSendResponse {
  SMSMessageData: {
    Message: string;
    Recipients: Array<{
      statusCode: number;
      number: string;
      status: string;
      cost: string;
      messageId: string;
    }>;
  };
}

class AfricasTalkingProvider {
  private client: ATClient | null = null;
  private config: AfricasTalkingConfig;
  private logger: ILogger;

  constructor(config: AfricasTalkingConfig, logger: ILogger) {
    this.config = { environment: 'production', ...config };
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    try {
      const at = (await import('africastalking')).default as unknown as ATModule;
      this.client = at({
        username: this.config.username,
        apiKey: this.config.apiKey,
      });
      this.logger.info('📲 Africa\'s Talking SMS initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Africa\'s Talking', { error: (error as Error).message });
      throw error;
    }
  }

  async send(recipient: NotificationRecipient, payload: NotificationPayload): Promise<NotificationResult> {
    if (!recipient.phoneNumber) {
      return {
        success: false,
        notificationId: payload.id,
        channel: 'sms',
        provider: 'africastalking',
        timestamp: new Date(),
        error: 'No phone number available for recipient',
      };
    }

    if (!this.client) {
      throw new Error('Africa\'s Talking not initialized');
    }

    try {
      const response = await this.client.SMS.send({
        to: [recipient.phoneNumber],
        message: `${payload.title}\n\n${payload.body}`,
        from: this.config.from,
        enqueue: true,
      });

      const recipients = response.SMSMessageData.Recipients;
      const successCount = recipients.filter(r => r.status === 'Success').length;

      return {
        success: successCount > 0,
        notificationId: payload.id,
        channel: 'sms',
        provider: 'africastalking',
        timestamp: new Date(),
        recipientCount: successCount,
        providerResponse: response,
        error: successCount === 0 ? response.SMSMessageData.Message : undefined,
      };
    } catch (error) {
      this.logger.error('Africa\'s Talking send error', { error: (error as Error).message });
      return {
        success: false,
        notificationId: payload.id,
        channel: 'sms',
        provider: 'africastalking',
        timestamp: new Date(),
        error: (error as Error).message,
      };
    }
  }
}

// ==================== Notification Service Implementation ====================

export class NotificationService implements INotificationService {
  private config: NotificationsConfig;
  private logger: ILogger;
  private providers: {
    fcm?: FCMProvider;
    oneSignal?: OneSignalProvider;
    sendgrid?: SendGridProvider;
    twilio?: TwilioProvider;
    africasTalking?: AfricasTalkingProvider;
  } = {};

  constructor(config: NotificationsConfig, logger?: ILogger) {
    this.config = {
      general: {
        retryAttempts: 3,
        retryDelayMs: 5000,
        defaultCountryCode: '254',
      },
      ...config,
    };
    this.logger = logger || new StructuredLogger();
  }

  async initialize(): Promise<void> {
    if (this.config.fcm) {
      this.providers.fcm = new FCMProvider(this.config.fcm, this.logger);
      await this.providers.fcm.initialize();
    }

    if (this.config.oneSignal) {
      this.providers.oneSignal = new OneSignalProvider(this.config.oneSignal, this.logger);
      await this.providers.oneSignal.initialize();
    }

    if (this.config.sendgrid) {
      this.providers.sendgrid = new SendGridProvider(this.config.sendgrid, this.logger);
      await this.providers.sendgrid.initialize();
    }

    if (this.config.twilio) {
      this.providers.twilio = new TwilioProvider(this.config.twilio, this.logger);
      await this.providers.twilio.initialize();
    }

    if (this.config.africasTalking) {
      this.providers.africasTalking = new AfricasTalkingProvider(this.config.africasTalking, this.logger);
      await this.providers.africasTalking.initialize();
    }

    this.logger.info('🔔 Notification service initialized');
  }

  async send(
    recipient: NotificationRecipient,
    payload: NotificationPayload,
    channels?: NotificationChannel[]
  ): Promise<NotificationResult[]> {
    const targetChannels = channels || this.determineChannels(recipient, payload);
    const results: NotificationResult[] = [];

    for (const channel of targetChannels) {
      const result = await this.sendToChannel(channel, recipient, payload);
      results.push(result);
    }

    return results;
  }

  async sendBatch(
    recipients: NotificationRecipient[],
    payload: NotificationPayload,
    channels?: NotificationChannel[]
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    
    for (const recipient of recipients) {
      const recipientResults = await this.send(recipient, payload, channels);
      results.push(...recipientResults);
    }

    return results;
  }

  async registerDevice(userId: string, token: string, platform: 'ios' | 'android' | 'web'): Promise<void> {
    await this.providers.fcm?.registerDevice(userId, token);
    this.logger.debug('Device registered', { userId, platform });
  }

  async unregisterDevice(userId: string, token: string): Promise<void> {
    await this.providers.fcm?.unregisterDevice(userId, token);
    this.logger.debug('Device unregistered', { userId });
  }

  async healthCheck(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};

    // Basic health check - check if providers are initialized
    health.fcm = !!this.providers.fcm;
    health.onesignal = !!this.providers.oneSignal;
    health.sendgrid = !!this.providers.sendgrid;
    health.twilio = !!this.providers.twilio;
    health.africastalking = !!this.providers.africasTalking;

    return health;
  }

  private determineChannels(recipient: NotificationRecipient, payload: NotificationPayload): NotificationChannel[] {
    const channels: NotificationChannel[] = [];
    const prefs = recipient.preferences || {};

    // Push notification
    if ((recipient.fcmTokens?.length || recipient.oneSignalPlayerIds?.length) && prefs.pushEnabled !== false) {
      channels.push('push');
    }

    // Email
    if (recipient.email && prefs.emailEnabled !== false) {
      channels.push('email');
    }

    // SMS for high priority
    if (recipient.phoneNumber && prefs.smsEnabled !== false && payload.priority === 'high') {
      channels.push('sms');
    }

    return channels;
  }

  private async sendToChannel(
    channel: NotificationChannel,
    recipient: NotificationRecipient,
    payload: NotificationPayload
  ): Promise<NotificationResult> {
    switch (channel) {
      case 'push':
        // Try FCM first, then OneSignal as fallback
        if (this.providers.fcm) {
          return await this.providers.fcm.send(recipient, payload);
        }
        if (this.providers.oneSignal) {
          return await this.providers.oneSignal.send(recipient, payload);
        }
        return {
          success: false,
          notificationId: payload.id,
          channel: 'push',
          provider: 'none',
          timestamp: new Date(),
          error: 'No push notification provider configured',
        };

      case 'email':
        if (this.providers.sendgrid) {
          return await this.providers.sendgrid.send(recipient, payload);
        }
        return {
          success: false,
          notificationId: payload.id,
          channel: 'email',
          provider: 'none',
          timestamp: new Date(),
          error: 'No email provider configured',
        };

      case 'sms':
        // Try Africa's Talking first (optimized for Africa), then Twilio
        if (this.providers.africasTalking) {
          return await this.providers.africasTalking.send(recipient, payload);
        }
        if (this.providers.twilio) {
          return await this.providers.twilio.send(recipient, payload);
        }
        return {
          success: false,
          notificationId: payload.id,
          channel: 'sms',
          provider: 'none',
          timestamp: new Date(),
          error: 'No SMS provider configured',
        };

      default:
        return {
          success: false,
          notificationId: payload.id,
          channel,
          provider: 'none',
          timestamp: new Date(),
          error: `Unknown channel: ${channel}`,
        };
    }
  }
}

// ==================== Notification Builder ====================

export class NotificationBuilder {
  private payload: Partial<NotificationPayload> = {
    priority: 'normal',
    data: {},
  };

  static create(id: string): NotificationBuilder {
    const builder = new NotificationBuilder();
    builder.payload.id = id;
    return builder;
  }

  withTitle(title: string): this {
    this.payload.title = title;
    return this;
  }

  withBody(body: string): this {
    this.payload.body = body;
    return this;
  }

  withType(type: string): this {
    this.payload.type = type;
    return this;
  }

  withPriority(priority: NotificationPriority): this {
    this.payload.priority = priority;
    return this;
  }

  withTransaction(transaction: Transaction): this {
    this.payload.transaction = transaction;
    return this;
  }

  withUrl(url: string): this {
    this.payload.url = url;
    return this;
  }

  withImageUrl(imageUrl: string): this {
    this.payload.imageUrl = imageUrl;
    return this;
  }

  withData(data: Record<string, unknown>): this {
    this.payload.data = { ...this.payload.data, ...data };
    return this;
  }

  withActions(actions: NotificationAction[]): this {
    this.payload.actions = actions;
    return this;
  }

  fromTransactionEvent(
    eventType: 'payment.initiated' | 'payment.completed' | 'payment.failed' | 'refund.processed',
    transaction: Transaction
  ): this {
    this.payload.transaction = transaction;
    this.payload.data = {
      transactionId: transaction.id,
      provider: transaction.provider,
      amount: transaction.amount.amount,
      currency: transaction.amount.currency,
    };

    switch (eventType) {
      case 'payment.initiated':
        this.payload.title = 'Payment Initiated';
        this.payload.body = `Your payment of ${transaction.amount.amount} ${transaction.amount.currency} has been initiated.`;
        this.payload.type = 'payment.initiated';
        this.payload.priority = 'normal';
        break;
      case 'payment.completed':
        this.payload.title = 'Payment Successful';
        this.payload.body = `Your payment of ${transaction.amount.amount} ${transaction.amount.currency} was successful.`;
        this.payload.type = 'payment.completed';
        this.payload.priority = 'high';
        break;
      case 'payment.failed':
        this.payload.title = 'Payment Failed';
        this.payload.body = `Your payment of ${transaction.amount.amount} ${transaction.amount.currency} failed. ${transaction.failureReason || ''}`;
        this.payload.type = 'payment.failed';
        this.payload.priority = 'high';
        break;
      case 'refund.processed':
        this.payload.title = 'Refund Processed';
        this.payload.body = `Your refund of ${transaction.amount.amount} ${transaction.amount.currency} has been processed.`;
        this.payload.type = 'refund.processed';
        this.payload.priority = 'normal';
        break;
    }

    return this;
  }

  build(): NotificationPayload {
    if (!this.payload.id || !this.payload.title || !this.payload.body || !this.payload.type) {
      throw new Error('Notification ID, title, body, and type are required');
    }

    return this.payload as NotificationPayload;
  }
}

// ==================== Singleton Instance ====================

let globalNotificationService: NotificationService | null = null;

export async function initializeNotifications(
  config: NotificationsConfig,
  logger?: ILogger
): Promise<NotificationService> {
  globalNotificationService = new NotificationService(config, logger);
  await globalNotificationService.initialize();
  return globalNotificationService;
}

export function getNotificationService(): NotificationService | null {
  return globalNotificationService;
}

export function setNotificationService(service: NotificationService): void {
  globalNotificationService = service;
}
