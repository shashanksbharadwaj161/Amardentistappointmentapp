export const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

export function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...extraHeaders } })
}

// Browser endpoints use explicit bearer tokens, never ambient cookies.
// CORS permits browser clients; handlers still enforce identity and role.
export function browserEndpoint(handler: (request: Request) => Promise<Response>) {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
    'access-control-allow-methods': 'POST, OPTIONS',
  }
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    let response: Response
    try { response = await handler(request) }
    catch { response = json(500, { ok: false, error: { code: 'INTERNAL_ERROR' } }) }
    const headers = new Headers(response.headers)
    for (const [key, value] of Object.entries(cors)) headers.set(key, value)
    return new Response(response.body, { status: response.status, headers })
  }
}
