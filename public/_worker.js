// ==============================================================================
// Cloudflare Pages / Workers Advanced Mode Worker
// Serves static assets with SPA routing and proxies /api/* to the Node.js backend
// ==============================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --------------------------------------------------------------------------
    // 1. API Route Handling (/api/*)
    // --------------------------------------------------------------------------
    if (url.pathname.startsWith('/api/')) {
      // Handle CORS preflight OPTIONS request
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers':
              'Content-Type, Authorization, X-AuditEQ-Token, X-AuditEQ-Database, X-AuditEQ-Workspace, X-Session-Id, X-Customer-Number, X-Stream-Final',
            'Access-Control-Max-Age': '86400',
          },
        });
      }

      // Read configured backend URL from Cloudflare environment
      const backendBase = (env.BACKEND_URL || env.API_URL || '').trim().replace(/\/+$/, '');

      // If backend is not configured yet, return clear diagnostic JSON instead of HTTP 405
      if (!backendBase) {
        return new Response(
          JSON.stringify({
            ok: false,
            authenticated: false,
            error:
              'Cloudflare: BACKEND_URL environment variable is not configured. Set BACKEND_URL in your Cloudflare dashboard (Settings > Environment variables) pointing to your Node.js backend (e.g. https://api.yourdomain.com), or click "Configure Server" on the login screen to enter your backend URL.',
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

      // Proxy request to the authoritative Node.js backend
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
      } catch (err) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `Cloudflare Proxy: Unable to reach backend server at ${backendBase}. ${err?.message || 'Connection refused'}. Check that your backend service is running and accessible.`,
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
    }

    // --------------------------------------------------------------------------
    // 2. Static Assets Serving & SPA Fallback for all other routes
    // --------------------------------------------------------------------------
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      const assetRes = await env.ASSETS.fetch(request);
      // SPA Fallback: if asset not found and not a file extension, serve index.html
      if (assetRes.status === 404 && request.method === 'GET' && !url.pathname.includes('.')) {
        const fallbackUrl = new URL('/index.html', request.url);
        return env.ASSETS.fetch(new Request(fallbackUrl.toString(), request));
      }
      return assetRes;
    }

    return new Response('Not Found', { status: 404 });
  },
};
