/**
 * API Gateway Lambda Authorizer
 * Validates API Keys against DynamoDB
 */

import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const API_KEY_TABLE = process.env.API_KEY_TABLE || 'africa-payments-apikeys-production';

interface ApiKeyRecord {
  apiKey: string;
  tenantId: string;
  name: string;
  permissions: string[];
  rateLimit: number;
  expiresAt?: number;
  active: boolean;
}

export async function handler(
  event: APIGatewayTokenAuthorizerEvent,
  context: Context
): Promise<APIGatewayAuthorizerResult> {
  try {
    const apiKey = event.authorizationToken;

    if (!apiKey) {
      throw new Error('Unauthorized - No API key provided');
    }

    // Remove "Bearer " prefix if present
    const cleanKey = apiKey.replace(/^Bearer\s+/i, '');

    // Look up the API key in DynamoDB
    const result = await docClient.send(new GetCommand({
      TableName: API_KEY_TABLE,
      Key: { apiKey: cleanKey },
    }));

    const record = result.Item as ApiKeyRecord | undefined;

    if (!record) {
      throw new Error('Unauthorized - Invalid API key');
    }

    if (!record.active) {
      throw new Error('Unauthorized - API key is deactivated');
    }

    if (record.expiresAt && record.expiresAt < Math.floor(Date.now() / 1000)) {
      throw new Error('Unauthorized - API key has expired');
    }

    // Generate policy document allowing access
    return generatePolicy(record.tenantId, 'Allow', event.methodArn, {
      tenantId: record.tenantId,
      apiKeyName: record.name,
      permissions: record.permissions.join(','),
      rateLimit: String(record.rateLimit),
    });

  } catch (error) {
    console.error('Authorization error:', error);
    throw new Error('Unauthorized');
  }
}

function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, string>
): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    context,
  };
}

export default handler;
