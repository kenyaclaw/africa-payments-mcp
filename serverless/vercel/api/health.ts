/**
 * Simple health check endpoint
 * Lightweight endpoint for monitoring
 */

export const config = {
  runtime: 'edge',
};

export default async function handler(): Promise<Response> {
  return new Response(
    JSON.stringify({
      status: 'healthy',
      service: 'africa-payments-mcp',
      version: '0.1.0',
      platform: 'vercel-edge',
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    }
  );
}
