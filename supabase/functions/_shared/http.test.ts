import { browserEndpoint, json } from './http.ts'
function assert(value: boolean) { if (!value) throw new Error('assertion failed') }
Deno.test('browser preflight succeeds without invoking a privileged handler', async () => {
  const response = await browserEndpoint(async () => { throw new Error('must not run') })(new Request('https://test.local',{method:'OPTIONS',headers:{origin:'http://localhost:5173','access-control-request-headers':'authorization,x-client-info,apikey'}}))
  assert(response.status === 204)
  assert(response.headers.get('access-control-allow-headers')!.includes('x-client-info'))
})
Deno.test('browser clients can read authentication errors without bypassing them', async () => {
  const response = await browserEndpoint(async () => json(401,{ok:false}))(new Request('https://test.local',{method:'POST'}))
  assert(response.status === 401 && response.headers.get('access-control-allow-origin') === '*')
  assert(!response.headers.has('access-control-allow-credentials'))
})
Deno.test('unexpected server errors do not disclose internal details', async () => {
  const response = await browserEndpoint(async () => { throw new Error('sensitive internal value') })(new Request('https://test.local',{method:'POST'}))
  assert(response.status === 500 && !(await response.text()).includes('sensitive'))
})
