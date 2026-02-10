/**
 * Orders API – Vercel serverless function.
 * POST: Append order to data/store-data.json in the GitHub repo (so admin and all devices see it).
 * Requires env: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO; optional GITHUB_BRANCH (default main).
 * CORS: Allow any origin so the storefront can POST from GitHub Pages or any domain.
 */

const GITHUB_API = 'https://api.github.com';
const STORE_DATA_PATH = 'data/store-data.json';

function corsHeaders(origin) {
  const o = origin || '*';
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

async function getFile(owner, repo, path, branch, token) {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub GET failed: ${res.status} ${err}`);
  }
  return res.json();
}

async function putFile(owner, repo, path, content, sha, branch, token, message) {
  const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: message || 'Add order via Orders API',
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch
  };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub PUT failed: ${res.status} ${err}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  const origin = req.headers.origin || req.headers.Referer ? new URL(req.headers.Referer || 'https://example.com').origin : '*';

  if (req.method === 'OPTIONS') {
    res.status(204);
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
    return res.end();
  }

  if (req.method !== 'POST') {
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = (process.env.GITHUB_BRANCH || 'main').trim() || 'main';

  if (!token || !owner || !repo) {
    console.error('Orders API: missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO');
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
    res.status(500).json({ error: 'Orders API not configured (missing env)' });
    return;
  }

  let order;
  try {
    order = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
  } catch (e) {
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  if (!order.fullName && !order.phone) {
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
    res.status(400).json({ error: 'Order must include fullName and phone' });
    return;
  }

  order.id = order.id || 'ord-' + Date.now();
  order.status = order.status || 'pending';

  try {
    const file = await getFile(owner, repo, STORE_DATA_PATH, branch, token);
    const content = Buffer.from(file.content, 'base64').toString('utf8');
    const data = JSON.parse(content);
    if (!Array.isArray(data.orders)) data.orders = [];
    data.orders.unshift(order);
    const newContent = JSON.stringify(data, null, 2);
    await putFile(owner, repo, STORE_DATA_PATH, newContent, file.sha, branch, token, 'Add order ' + order.id);
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
    res.status(200).json({ ok: true, id: order.id });
  } catch (err) {
    console.error('Orders API error:', err.message);
    Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));
    res.status(500).json({ error: 'Failed to save order', detail: err.message });
  }
}
