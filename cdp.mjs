// CDP transport for an already-enabled, loopback-only Steam debugging endpoint.
export async function evaluate(expression, endpoint = 'http://127.0.0.1:8080') {
  const base = new URL(endpoint);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.protocol !== 'http:')
    throw Error('Only loopback HTTP endpoints are supported');
  const response = await fetch(new URL('/json/list', base), {signal: AbortSignal.timeout(5000)});
  if (!response.ok) throw Error(`CDP discovery HTTP ${response.status}`);
  const pages = await response.json();
  const page = pages.find(p => p.title === 'SharedJSContext');
  if (!page) throw Error('Steam SharedJSContext is unavailable');
  const url = new URL(page.webSocketDebuggerUrl);
  // Honor the SSH forwarding port instead of the remotely advertised port.
  url.hostname = base.hostname; url.port = base.port; url.protocol = 'ws:';
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => finish(Error('CDP timed out')), 10000);
    function finish(error, value) {
      clearTimeout(timer); ws.close(); error ? reject(error) : resolve(value);
    }
    ws.onopen = () => ws.send(JSON.stringify({id:1, method:'Runtime.evaluate', params:{expression, returnByValue:true, awaitPromise:true}}));
    ws.onerror = () => finish(Error('CDP connection failed'));
    ws.onclose = () => finish(Error('CDP closed before reply'));
    ws.onmessage = e => {
      let message;
      try { message = JSON.parse(e.data); } catch (error) { finish(error); return; }
      if (message.id !== 1) return;
      if (message.error || message.result?.exceptionDetails) {
        finish(Error(JSON.stringify(message.error || message.result.exceptionDetails))); return;
      }
      finish(null, message.result?.result?.value);
    };
  });
}
