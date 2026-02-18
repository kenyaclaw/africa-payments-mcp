#import "AfricaPaymentsMcpRn.h"
#import <React/RCTLog.h>

@implementation AfricaPaymentsMcpRn

RCT_EXPORT_MODULE()

// MARK: - Module Setup

+ (BOOL)requiresMainQueueSetup
{
    return NO;
}

- (NSArray<NSString *> *)supportedEvents
{
    return @[@"onPaymentEvent"];
}

// MARK: - Properties

static NSDictionary *currentConfig = nil;

// MARK: - Exported Methods

RCT_EXPORT_METHOD(initialize:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        if (!config || !config[@"apiKey"]) {
            reject(@"INVALID_CONFIG", @"API key is required", nil);
            return;
        }
        
        currentConfig = config;
        RCTLogInfo(@"Africa Payments MCP SDK initialized");
        resolve(@{@"success": @YES, @"message": @"SDK initialized successfully"});
    } @catch (NSException *exception) {
        reject(@"INIT_ERROR", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(initiatePayment:(NSDictionary *)request
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        if (!currentConfig) {
            reject(@"NOT_INITIALIZED", @"SDK not initialized. Call initialize() first.", nil);
            return;
        }
        
        // Validate request
        if (!request[@"amount"] || !request[@"phoneNumber"] || !request[@"reference"]) {
            reject(@"INVALID_REQUEST", @"Amount, phone number, and reference are required", nil);
            return;
        }
        
        // Generate transaction ID
        NSString *transactionId = [[NSUUID UUID] UUIDString];
        NSString *timestamp = [self iso8601StringFromDate:[NSDate date]];
        
        // Create response
        NSMutableDictionary *response = [@{
            @"transactionId": transactionId,
            @"status": @"pending",
            @"reference": request[@"reference"],
            @"amount": request[@"amount"],
            @"currency": request[@"currency"] ?: @"KES",
            @"phoneNumber": request[@"phoneNumber"],
            @"createdAt": timestamp,
            @"updatedAt": timestamp
        } mutableCopy];
        
        // Emit event
        [self emitPaymentEvent:@"payment.initiated" data:response];
        
        // Simulate async payment processing
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            response[@"status"] = @"pending";
            response[@"updatedAt"] = [self iso8601StringFromDate:[NSDate date]];
            [self emitPaymentEvent:@"payment.pending" data:response];
        });
        
        resolve(response);
    } @catch (NSException *exception) {
        reject(@"PAYMENT_ERROR", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(getTransaction:(NSString *)transactionId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        if (!currentConfig) {
            reject(@"NOT_INITIALIZED", @"SDK not initialized", nil);
            return;
        }
        
        // Mock transaction data
        NSDictionary *transaction = @{
            @"transactionId": transactionId,
            @"status": @"success",
            @"reference": @"REF-001",
            @"amount": @1000,
            @"currency": @"KES",
            @"phoneNumber": @"254712345678",
            @"createdAt": [self iso8601StringFromDate:[NSDate date]],
            @"updatedAt": [self iso8601StringFromDate:[NSDate date]],
            @"receiptUrl": @"https://api.example.com/receipts/123"
        };
        
        resolve(transaction);
    } @catch (NSException *exception) {
        reject(@"FETCH_ERROR", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(getTransactionHistory:(NSDictionary *)query
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        if (!currentConfig) {
            reject(@"NOT_INITIALIZED", @"SDK not initialized", nil);
            return;
        }
        
        // Mock transaction history
        NSArray *transactions = @[
            @{
                @"transactionId": @"tx-001",
                @"status": @"success",
                @"reference": @"REF-001",
                @"amount": @1000,
                @"currency": @"KES",
                @"phoneNumber": @"254712345678",
                @"createdAt": [self iso8601StringFromDate:[NSDate date]],
                @"updatedAt": [self iso8601StringFromDate:[NSDate date]]
            },
            @{
                @"transactionId": @"tx-002",
                @"status": @"pending",
                @"reference": @"REF-002",
                @"amount": @2000,
                @"currency": @"KES",
                @"phoneNumber": @"254712345679",
                @"createdAt": [self iso8601StringFromDate:[NSDate date]],
                @"updatedAt": [self iso8601StringFromDate:[NSDate date]]
            }
        ];
        
        NSDictionary *history = @{
            @"transactions": transactions,
            @"total": @2,
            @"hasMore": @NO
        };
        
        resolve(history);
    } @catch (NSException *exception) {
        reject(@"FETCH_ERROR", exception.reason, nil);
    }
}

RCT_EXPORT_METHOD(refundTransaction:(NSString *)transactionId
                  amount:(NSNumber *)amount
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    @try {
        if (!currentConfig) {
            reject(@"NOT_INITIALIZED", @"SDK not initialized", nil);
            return;
        }
        
        // Mock refund response
        NSDictionary *response = @{
            @"transactionId": [[NSUUID UUID] UUIDString],
            @"status": @"success",
            @"reference": @"REFUND-001",
            @"amount": amount ?: @1000,
            @"currency": @"KES",
            @"phoneNumber": @"254712345678",
            @"createdAt": [self iso8601StringFromDate:[NSDate date]],
            @"updatedAt": [self iso8601StringFromDate:[NSDate date]]
        };
        
        resolve(response);
    } @catch (NSException *exception) {
        reject(@"REFUND_ERROR", exception.reason, nil);
    }
}

// MARK: - Helper Methods

- (void)emitPaymentEvent:(NSString *)type data:(NSDictionary *)data
{
    NSDictionary *event = @{
        @"type": type,
        @"data": data,
        @"timestamp": @([[NSDate date] timeIntervalSince1970] * 1000)
    };
    
    [self sendEventWithName:@"onPaymentEvent" body:event];
}

- (NSString *)iso8601StringFromDate:(NSDate *)date
{
    NSDateFormatter *formatter = [[NSDateFormatter alloc] init];
    formatter.dateFormat = @"yyyy-MM-dd'T'HH:mm:ss.SSSZ";
    formatter.locale = [NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"];
    formatter.timeZone = [NSTimeZone timeZoneWithAbbreviation:@"UTC"];
    return [formatter stringFromDate:date];
}

@end
