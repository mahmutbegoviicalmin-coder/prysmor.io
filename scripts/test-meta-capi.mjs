import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const token = env.META_CAPI_TOKEN;
const pixel = '1468737715025683';

const payload = {
  data: [{
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: `test_purchase_${Date.now()}`,
    action_source: 'website',
    event_source_url: 'https://prysmor.io/pricing',
    user_data: {
      em: ['7b17c0becbdff16c6559e889fe5b9d7520b31156fcbf2153d1989ef88ab614bb'],
    },
    custom_data: {
      value: 29,
      currency: 'USD',
      order_id: 'test_order_123',
      content_type: 'product',
    },
  }],
  access_token: token,
};

const res = await fetch(`https://graph.facebook.com/v19.0/${pixel}/events`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const body = await res.json();
console.log(JSON.stringify({
  status: res.status,
  events_received: body.events_received ?? null,
  messages: body.messages ?? null,
  error: body.error?.message ?? null,
  code: body.error?.code ?? null,
}, null, 2));
