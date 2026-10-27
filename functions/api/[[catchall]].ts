// ==============================================================================
// Cloudflare Pages Function: Reverse Proxy for /api/* requests
// Reads BACKEND_URL or API_URL from Cloudflare Pages Environment Variables
// ==============================================================================

interface Env {
  BACKEND_URL?: string;
  API_URL?: string;
}

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  const backendBase = (env.BACKEND_URL || env.API_URL || '').trim().replace(/\/+$/, '');

  // Handle preflight OPTIONS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-AuditEQ-Token, X-AuditEQ-Database, X-AuditEQ-Workspace, X-Session-Id, X-Customer-Number, X-Stream-Final',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // If no backend URL configured in Cloudflare Pages environment variables, return clear diagnostic JSON
  if (!backendBase) {
    return new Response(
      JSON.stringify({
        ok: false,
        authenticated: false,
        error:
          'Cloudflare Pages: BACKEND_URL environment variable is not configured. Set BACKEND_URL in Cloudflare Pages (Settings > Environment variables) pointing to your Node.js server (e.g. https://api.yourdomain.com), or click "Configure Server" on the login screen.',
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  // Forward the request to the real Node.js backend server
  const url = new URL(request.url);
  const targetUrl = `${backendBase}${url.pathname}${url.search}`;

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.set('X-Forwarded-Host', url.host);
  forwardHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

  try {
    const isBodyAllowed = request.method !== 'GET' && request.method !== 'HEAD';
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: isBodyAllowed ? request.body : undefined,
      redirect: 'follow',
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    responseHeaders.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-AuditEQ-Token, X-AuditEQ-Database, X-AuditEQ-Workspace, X-Session-Id, X-Customer-Number, X-Stream-Final'
    );

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Cloudflare Pages: Unable to reach backend at ${backendBase}. ${err?.message || 'Connection refused'}`,
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
};
