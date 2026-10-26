// Only invalidation signals cross tabs; customer records never enter this channel/storage.
const eventName = 'mbs:customers-changed';
const channelName = 'mbs-customer-invalidation';

export function notifyCustomerChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(eventName));
  if (typeof BroadcastChannel !== 'undefined') {
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel(channelName);
      channel.postMessage('changed');
    } catch { /* A blocked channel must not turn a successful database save into an error. */ }
    finally { channel?.close(); }
  }
}

export function subscribeCustomerChanges(refresh: () => void): () => void {
  let channel: BroadcastChannel | undefined;
  try { if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(channelName); }
  catch { /* Focus refresh and polling remain available when the browser blocks channels. */ }
  if (channel) channel.onmessage = event => { if (event.data === 'changed') refresh(); };
  window.addEventListener(eventName, refresh);
  return () => { window.removeEventListener(eventName, refresh); channel?.close(); };
}
