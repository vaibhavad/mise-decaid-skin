// Transport to the Decaid gateway: REST over fetch and auto-reconnecting
// WebSockets. The demo transport in sim.js exposes the same two functions.

export function gatewayHost() {
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get('gateway');
  if (fromQuery) {
    try { localStorage.setItem('miseGateway', fromQuery); } catch { /* storage unavailable */ }
  }
  let saved = null;
  try { saved = localStorage.getItem('miseGateway'); } catch { /* storage unavailable */ }
  const host = fromQuery || saved || location.hostname || 'localhost';
  return host.includes(':') ? host : `${host}:8080`;
}

export function savedGateway() {
  try { return localStorage.getItem('miseGateway'); } catch { return null; }
}

export function forgetGateway() {
  try { localStorage.removeItem('miseGateway'); } catch { /* storage unavailable */ }
}

export function httpTransport(host) {
  const base = `http://${host}`;
  const wsBase = `ws://${host}`;

  async function request(method, path, body, timeout = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(base + path, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch { data = text; }
      }
      if (!response.ok) {
        const error = new Error(`${method} ${path} failed with ${response.status}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  // Returns a function that closes the stream for good.
  function stream(path, onMessage) {
    let socket = null;
    let closed = false;
    let retry = null;
    let delay = 500;

    const open = () => {
      if (closed) return;
      socket = new WebSocket(wsBase + path);
      socket.onopen = () => { delay = 500; };
      socket.onmessage = (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        onMessage(message);
      };
      socket.onerror = () => { try { socket.close(); } catch { /* already closed */ } };
      socket.onclose = () => {
        if (closed) return;
        retry = setTimeout(open, delay);
        delay = Math.min(delay * 2, 8000);
      };
    };
    open();

    return () => {
      closed = true;
      clearTimeout(retry);
      try { socket.close(); } catch { /* already closed */ }
    };
  }

  return { request, stream, host, demo: false };
}
