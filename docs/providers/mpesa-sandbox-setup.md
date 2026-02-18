# M-Pesa Sandbox Setup Guide

A comprehensive guide to obtaining M-Pesa sandbox credentials from the Safaricom Daraja API portal for testing and development.

## Overview

The Safaricom Daraja API provides a sandbox environment where you can test M-Pesa integrations without using real money. This guide walks you through the complete process of setting up your sandbox account and obtaining the necessary credentials.

**Estimated Time:** 15-30 minutes  
**Difficulty:** Beginner  
**Cost:** Free

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Create a Daraja Developer Account](#step-1-create-a-daraja-developer-account)
3. [Step 2: Create a New App](#step-2-create-a-new-app)
4. [Step 3: Get Consumer Key and Secret](#step-3-get-consumer-key-and-secret)
5. [Step 4: Generate Passkey](#step-4-generate-passkey)
6. [Step 5: Sandbox Test Credentials](#step-5-sandbox-test-credentials)
7. [Step 6: Simulate Payments](#step-6-simulate-payments)
8. [Common Pitfalls](#common-pitfalls)
9. [Troubleshooting](#troubleshooting)
10. [Next Steps](#next-steps)

---

## Prerequisites

Before you begin, ensure you have:

- A valid email address
- A working phone number (for verification)
- Basic understanding of REST APIs
- A tool for testing APIs (Postman, cURL, or the API Simulator on Daraja)

---

## Step 1: Create a Daraja Developer Account

### 1.1 Visit the Daraja Portal

Navigate to the Safaricom Developer Portal: **https://developer.safaricom.co.ke/**

### 1.2 Sign Up for an Account

1. Click on the **"Sign Up"** or **"Register"** button
2. Fill in the registration form with:
   - **First Name** and **Last Name**
   - **Email Address** (will be used for login)
   - **Phone Number** (Safaricom number recommended, but any valid number works)
   - **Password** (create a strong, secure password)

> **Screenshot Description:** The registration page shows a simple form with fields for personal information and a prominent "Create Account" button.

### 1.3 Verify Your Email

1. Check your email inbox for a verification message from Safaricom
2. Click the verification link or enter the OTP sent to your phone
3. If you don't see the email, check your spam/junk folder

::: tip Verification Timeline
Email verification is usually instant, but may take up to 5 minutes. Phone verification via SMS is typically immediate.
:::

### 1.4 Log In to the Portal

Once verified, log in with your email and password at **https://developer.safaricom.co.ke/login**

---

## Step 2: Create a New App

### 2.1 Navigate to My Apps

After logging in:
1. Click on **"My Apps"** in the top navigation menu
2. Click the **"Create New App"** button

> **Screenshot Description:** The "My Apps" page displays any existing apps in a list view with a green "Create New App" button in the top-right corner.

### 2.2 Configure Your App

Fill in the app creation form:

| Field | Description | Example |
|-------|-------------|---------|
| **App Name** | A unique name for your application | `MyEcommerceApp` |
| **App Description** | Brief description of what the app does | `Payment integration for online store` |

### 2.3 Select API Products

Choose the products you want to use:

| Product | Purpose | Required For |
|---------|---------|--------------|
| **Lipa na M-Pesa Online** | STK Push payments | ✅ Customer payments |
| **M-Pesa Express** | Query transaction status | ✅ Recommended |
| **Account Balance** | Check account balance | Optional |
| **Transaction Reversal** | Reverse transactions | Optional |
| **B2C** | Business to Customer payments | Optional (requires approval) |
| **B2B** | Business to Business payments | Optional (requires approval) |

::: warning B2C/B2B Requirements
B2C (Business to Customer) and B2B (Business to Business) APIs require additional approval from Safaricom. For sandbox testing, you can select them, but they may have limited functionality until approved.
:::

### 2.4 Submit and Create

Click **"Create App"** to finalize the creation.

> **Expected Result:** You'll be redirected to your app's details page showing a success message.

---

## Step 3: Get Consumer Key and Secret

### 3.1 View App Credentials

After creating your app:

1. Go to **"My Apps"** → Select your newly created app
2. Click on the **"Keys"** tab

> **Screenshot Description:** The Keys tab displays two masked fields for Consumer Key and Consumer Secret, with a "Show" button next to each.

### 3.2 Copy Your Credentials

You'll see two important values:

| Credential | Format | Example |
|------------|--------|---------|
| **Consumer Key** | Alphanumeric string | `F3zRq8pL9wXy2K7mN4vB5jH6cA1sD8gQ` |
| **Consumer Secret** | Alphanumeric string | `A7bC9dE0fG1hI2jK3lM4nO5pQ6rS7tU8` |

**Click the "Show" button** to reveal each credential, then:
1. Copy the **Consumer Key**
2. Copy the **Consumer Secret**

::: warning Keep These Secret!
Treat these credentials like passwords. Never commit them to public repositories or share them in unsecured channels.
:::

### 3.3 Store Credentials Securely

Add them to your `.env` file:

```bash
# M-Pesa Daraja API Credentials
MPESA_CONSUMER_KEY=F3zRq8pL9wXy2K7mN4vB5jH6cA1sD8gQ
MPESA_CONSUMER_SECRET=A7bC9dE0fG1hI2jK3lM4nO5pQ6rS7tU8
```

---

## Step 4: Generate Passkey

The passkey is required for **Lipa na M-Pesa Online** (STK Push) transactions.

### 4.1 Request Passkey

1. In your app dashboard, click on the **"Lipa na M-Pesa Online"** product
2. Look for the **"Passkey"** section
3. Click **"Generate Passkey"**

> **Screenshot Description:** The product details page shows a "Generate Passkey" button and explains that this is used for encrypting STK Push requests.

### 4.2 Copy the Passkey

The passkey will be displayed once. It looks like:

```
bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
```

::: warning One-Time Display
The passkey is only shown once. Copy it immediately and store it securely. If you lose it, you'll need to generate a new one.
:::

### 4.3 Add to Environment Variables

```bash
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
```

---

## Step 5: Sandbox Test Credentials

Safaricom provides standard sandbox credentials that work across all sandbox apps for testing.

### 5.1 Standard Sandbox Credentials

| Credential | Value | Notes |
|------------|-------|-------|
| **Shortcode** | `174379` | Standard sandbox Paybill |
| **Passkey** | `bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919` | Fixed for sandbox |
| **Environment** | `sandbox` | Use this value in your config |

### 5.2 Sandbox API Endpoints

| Service | Sandbox URL |
|---------|-------------|
| OAuth Token | `https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials` |
| STK Push | `https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest` |
| STK Query | `https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query` |
| B2C | `https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest` |
| Account Balance | `https://sandbox.safaricom.co.ke/mpesa/accountbalance/v1/query` |
| Transaction Status | `https://sandbox.safaricom.co.ke/mpesa/transactionstatus/v1/query` |
| Reversal | `https://sandbox.safaricom.co.ke/mpesa/reversal/v1/request` |
| C2B Register | `https://sandbox.safaricom.co.ke/mpesa/c2b/v1/registerurl` |
| C2B Simulate | `https://sandbox.safaricom.co.ke/mpesa/c2b/v1/simulate` |

### 5.3 Test Phone Numbers

Use these phone numbers in the sandbox:

| Phone Number | Scenario | Expected Result |
|--------------|----------|-----------------|
| `254708374149` | Successful transaction | Success callback |
| `254708374150` | Insufficient funds | Failed callback with code 1 |
| `254708374151` | Wrong PIN | Failed callback |

::: tip Phone Number Format
Always use the format `2547XXXXXXXX` (country code + 9 digits). Do not include the leading zero of the local number.
:::

### 5.4 Complete Environment Configuration

```bash
# M-Pesa Sandbox Configuration
MPESA_CONSUMER_KEY=your_consumer_key_here
MPESA_CONSUMER_SECRET=your_consumer_secret_here
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
MPESA_SHORTCODE=174379
MPESA_ENVIRONMENT=sandbox
MPESA_CALLBACK_URL=https://your-ngrok-url.ngrok.io/webhooks/mpesa
```

---

## Step 6: Simulate Payments

### 6.1 Using the Daraja API Simulator

The Daraja portal provides a built-in simulator for testing:

1. Go to **"API Simulator"** in the left sidebar
2. Select the API you want to test (e.g., "Lipa na M-Pesa Online")
3. Fill in the required parameters
4. Click **"Send Request"**

> **Screenshot Description:** The API Simulator shows a form with fields for Phone Number, Amount, Account Reference, and Transaction Description, plus a "Send Request" button.

### 6.2 Simulate STK Push

Use these parameters in the simulator:

```json
{
  "BusinessShortCode": "174379",
  "Password": "[Base64 encoded password]",
  "Timestamp": "20240101120000",
  "TransactionType": "CustomerPayBillOnline",
  "Amount": "100",
  "PartyA": "254708374149",
  "PartyB": "174379",
  "PhoneNumber": "254708374149",
  "CallBackURL": "https://your-callback-url.com/webhook",
  "AccountReference": "TEST-ORDER-001",
  "TransactionDesc": "Test payment"
}
```

### 6.3 Test the Complete Flow

1. **Initiate STK Push**: Send a payment request
2. **Receive Callback**: Wait for the callback to your registered URL
3. **Verify Transaction**: Query the transaction status if needed

### 6.4 Using cURL for Testing

Generate an access token:

```bash
curl -X GET \
  'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials' \
  -H 'Authorization: Basic [Base64(CONSUMER_KEY:CONSUMER_SECRET)]'
```

Initiate STK Push:

```bash
curl -X POST \
  https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest \
  -H 'Authorization: Bearer [ACCESS_TOKEN]' \
  -H 'Content-Type: application/json' \
  -d '{
    "BusinessShortCode": "174379",
    "Password": "[BASE64_ENCODED_STRING]",
    "Timestamp": "20240101120000",
    "TransactionType": "CustomerPayBillOnline",
    "Amount": 100,
    "PartyA": "254708374149",
    "PartyB": "174379",
    "PhoneNumber": "254708374149",
    "CallBackURL": "https://your-callback-url.com/webhook",
    "AccountReference": "TEST-001",
    "TransactionDesc": "Test"
  }'
```

---

## Common Pitfalls

### Pitfall 1: Wrong Phone Number Format

❌ **Incorrect:** `0712345678` or `+254712345678`  
✅ **Correct:** `254712345678`

### Pitfall 2: Using Production Credentials in Sandbox

Sandbox and production credentials are **not interchangeable**. Always use:
- Sandbox credentials with sandbox endpoints
- Production credentials with production endpoints

### Pitfall 3: Missing HTTPS in Callback URLs

M-Pesa requires **HTTPS** for callback URLs. Localhost HTTP URLs will not work.

**Solution:** Use a tunneling service like [ngrok](https://ngrok.com/):

```bash
ngrok http 3000
```

Then use the HTTPS URL provided (e.g., `https://abc123.ngrok.io/webhooks/mpesa`)

### Pitfall 4: Incorrect Timestamp Format

The timestamp must be in the format: **YYYYMMDDHHMMSS**

```javascript
// JavaScript
const timestamp = new Date().toISOString()
  .replace(/[^0-9]/g, '')
  .slice(0, 14);
// Result: 20240101120000
```

### Pitfall 5: Wrong Password Encoding

The password for STK Push is generated by:

```
Base64Encode(Shortcode + Passkey + Timestamp)
```

Example in JavaScript:

```javascript
const crypto = require('crypto');

const shortcode = '174379';
const passkey = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
const timestamp = '20240101120000';

const password = Buffer.from(shortcode + passkey + timestamp).toString('base64');
// Result: MTc0Mzc5YmZiMjc5ZjlhYTliZGNmMTU4ZTk3ZGQ3MWE0NjdjZDJlMGM4OTMwNTliMTBmNzhlNmI3MmFkYTFlZDJjOTE5MjAyNDAxMDExMjAwMDA=
```

---

## Troubleshooting

### Issue: "Invalid Access Token" Error

**Cause:** Expired or improperly generated access token  
**Solution:**
1. Regenerate the access token using your Consumer Key and Secret
2. Tokens expire after 1 hour
3. Ensure you're using the correct Base64 encoding for the Authorization header

```bash
# Generate Base64 auth string
echo -n "CONSUMER_KEY:CONSUMER_SECRET" | base64
```

### Issue: "Invalid Security Credential" Error

**Cause:** Wrong passkey or password encoding  
**Solution:**
1. Verify you're using the sandbox passkey for sandbox requests
2. Double-check the password encoding formula
3. Ensure timestamp format is correct

### Issue: Callback Not Received

**Checklist:**
- [ ] Callback URL uses HTTPS
- [ ] URL is publicly accessible (not localhost)
- [ ] Server returns 200 OK for callbacks
- [ ] No firewall blocking Safaricom IPs
- [ ] SSL certificate is valid (not self-signed)

**Debugging Tips:**
1. Use webhook.site to test callback reception: https://webhook.site
2. Check server logs for incoming requests
3. Verify your callback URL is correctly configured

### Issue: "Transaction Failed" with Code 1

**Meaning:** Insufficient funds  
**Solution:** This is expected when using test number `254708374150`. Use `254708374149` for successful transactions.

### Issue: "Bad Request - Invalid Shortcode"

**Cause:** Using a shortcode not registered for your app  
**Solution:** In sandbox, always use `174379` unless you've registered a different one.

### Issue: Account Locked

**Cause:** Too many failed login attempts  
**Solution:** Wait 30 minutes and try again, or contact Safaricom support.

---

## Timeline: What to Expect

| Step | Estimated Time | Notes |
|------|---------------|-------|
| Account Registration | 5-10 minutes | Instant if email/phone verification works |
| Email Verification | 1-5 minutes | Check spam folder if not received |
| App Creation | 2-3 minutes | Instant |
| Passkey Generation | 1 minute | Instant |
| First API Test | 5-10 minutes | Depends on your setup |
| **Total Setup Time** | **15-30 minutes** | For basic sandbox setup |

::: info Production Access
Moving to production requires business verification and can take **3-14 business days** depending on document submission and approval.
:::

---

## Next Steps

Now that you have your sandbox credentials:

1. **Integrate with Africa Payments MCP**: See the [M-Pesa Provider Documentation](./mpesa.md)
2. **Set Up Webhooks**: Configure your callback URLs to handle payment notifications
3. **Test Thoroughly**: Use all provided test numbers and scenarios
4. **Apply for Production**: When ready, submit your business documents for production access

### Quick Integration Example

```javascript
// Configure Africa Payments MCP with your sandbox credentials
const config = {
  mpesa: {
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    passkey: process.env.MPESA_PASSKEY,
    shortcode: process.env.MPESA_SHORTCODE,
    environment: 'sandbox',
    callbackUrl: 'https://your-app.com/webhooks/mpesa'
  }
};
```

---

## Support Resources

| Resource | Link |
|----------|------|
| Daraja Portal | https://developer.safaricom.co.ke/ |
| API Documentation | https://developer.safaricom.co.ke/docs |
| Support Email | apisupport@safaricom.co.ke |
| Developer Forum | https://developer.safaricom.co.ke/forum |

## See Also

- [M-Pesa Provider Documentation](./mpesa.md) - Full API reference and integration guide
- [Configuration Guide](../configuration.md) - General configuration options
- [Webhooks Documentation](../webhooks.md) - Handling M-Pesa callbacks
