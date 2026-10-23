const WEB = (process.env.WEB_URL || 'https://roviel.vercel.app').replace(/\/$/, '');
const API = (process.env.API_URL || 'https://ledgerly-api-4yhc.onrender.com').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 45_000);

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await response.text();
  let body = text;
  try { body = JSON.parse(text); } catch {}
  return { response, body };
}

function fail(message, detail = '') {
  console.error(`FAIL  ${message}${detail ? ` — ${detail}` : ''}`);
  process.exitCode = 1;
}

function pass(message, detail = '') {
  console.log(`PASS  ${message}${detail ? ` — ${detail}` : ''}`);
}

try {
  const web = await request(WEB);
  if (web.response.ok && typeof web.body === 'string' && /Roviel/i.test(web.body)) pass('web app', `${web.response.status}`);
  else fail('web app', `${web.response.status}`);

  const health = await request(`${API}/health`);
  if (health.response.ok && health.body?.ok === true && health.body?.database !== 'down') {
    pass('API health', health.body.database ? `database ${health.body.database}` : 'ok');
  } else {
    fail('API health', `${health.response.status} ${JSON.stringify(health.body).slice(0, 100)}`);
  }

  const rate = await request(`${API}/api/fx/rate?base=USD&quote=EUR`);
  const rateValue = Number(rate.body?.rate);
  const observed = String(rate.body?.date || '');
  const observedAge = observed ? (Date.now() - new Date(`${observed}T00:00:00Z`).getTime()) / 86_400_000 : Infinity;
  if (rate.response.ok && Number.isFinite(rateValue) && rateValue > 0 && observedAge >= -2 && observedAge <= 10) {
    pass('reference rate', `USD/EUR ${rateValue} @ ${observed}`);
  } else {
    fail('reference rate', `${rate.response.status} rate=${rate.body?.rate} date=${observed}`);
  }

  const currencies = await request(`${API}/api/fx/currencies`);
  const currencyCount = Array.isArray(currencies.body) ? currencies.body.length : currencies.body && typeof currencies.body === 'object' ? Object.keys(currencies.body).length : 0;
  if (currencies.response.ok && currencyCount >= 150) pass('currency directory', `${currencyCount} currencies`);
  else fail('currency directory', `${currencies.response.status}, ${currencyCount} currencies`);

  const unauthorized = await request(`${API}/api/summary?months=1`);
  if (unauthorized.response.status === 401) pass('authenticated data stays protected');
  else fail('authenticated data stays protected', `expected 401, got ${unauthorized.response.status}`);
} catch (error) {
  fail('production smoke', error instanceof Error ? error.message : String(error));
}

if (process.exitCode) process.exit(process.exitCode);
console.log('Production smoke passed.');
