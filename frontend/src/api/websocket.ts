// live feed via websocket - the dashboard subscribes to this so decisions
// pop up instantly instead of waiting for the next poll. had to stick the
// jwt in the url because ws can't set headers, temporary workaround
type EventHandler = (event: any) => void;

let ws: WebSocket | null = null;
let handlers: EventHandler[] = [];
let reconnectTimer: any = null;

export function connectLiveFeed() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  // ws can't send an auth header so the token rides along as a query param
  const token = localStorage.getItem("certacito_token") || "";
  const url = `${proto}//${window.location.host}/api/v1/ws/live?token=${encodeURIComponent(token)}`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    // console.log("[WS] connected to live feed"); // noisy, keep off
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  };

  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      handlers.forEach(h => h(data));
    } catch {
      // bad json, just skip - server sometimes sends partial frames
    }
  };

  ws.onclose = () => {
    // auto reconnect, 3s felt ok after some trial and error
    reconnectTimer = setTimeout(connectLiveFeed, 3000);
  };

  ws.onerror = () => {
    // close it, onclose will kick the reconnect
    ws?.close();
  };
}

export function onLiveEvent(handler: EventHandler) {
  handlers.push(handler);
  // return unsubscribe fn so components can clean up
  return () => { handlers = handlers.filter(h => h !== handler); };
}

export function disconnectLiveFeed() {
  if (ws) { ws.close(); ws = null; }
  handlers = [];
}
