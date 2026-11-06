// Venue Desk API
// GET  /api/data                         -> { reqs, teams, settings }
// POST /api/data { pin, action, ... }    -> same shape after the change
//
// Storage (Upstash Redis): three hashes
//   vd:reqs      id -> requirement JSON
//   vd:teams     id -> team JSON
//   vd:settings  key -> value
import { Redis } from '@upstash/redis';
import { timingSafeEqual } from 'node:crypto';
import seed from '../lib/seed.js';

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const K = { reqs: 'vd:reqs', teams: 'vd:teams', settings: 'vd:settings', version: 'vd:version' };
const STATUSES = ['new', 'confirmed', 'progress', 'done', 'verified', 'blocked', 'dropped'];
const REPLIES = ['pending', 'needs', 'none'];

const str = (v, max = 500) => String(v ?? '').slice(0, max).trim();
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v); // client may auto-parse JSON

async function ensureSeeded() {
  const n = await redis.hlen(K.teams);
  if (n > 0) return;
  const p = redis.pipeline();
  const teams = Object.fromEntries(seed.teams.map((t) => [t.id, JSON.stringify(t)]));
  p.hset(K.teams, teams);
  if (seed.reqs.length) p.hset(K.reqs, Object.fromEntries(seed.reqs.map((r) => [r.id, JSON.stringify(r)])));
  const s = Object.fromEntries(Object.entries(seed.settings || {}).filter(([, v]) => v !== '' && v != null));
  if (Object.keys(s).length) p.hset(K.settings, s);
  p.incr(K.version);
  await p.exec();
}

async function readAll() {
  const [r, t, s, v] = await Promise.all([redis.hgetall(K.reqs), redis.hgetall(K.teams), redis.hgetall(K.settings), redis.get(K.version)]);
  let version = Number(v) || 0;
  if (!version) { await redis.set(K.version, 1, { nx: true }); version = Number(await redis.get(K.version)) || 1; }
  return {
    version,
    reqs: Object.entries(r || {}).map(([id, v]) => ({ ...parse(v), id })),
    teams: Object.entries(t || {}).map(([id, v]) => ({ ...parse(v), id })).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
    settings: { eventName: str(s?.eventName), lastSummaryAt: str(s?.lastSummaryAt) },
    fetchedAt: new Date().toISOString(),
  };
}

function pinOk(pin) {
  const real = process.env.EDIT_PIN || '';
  if (!real) return false;
  const a = Buffer.from(String(pin ?? '')), b = Buffer.from(real);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function getOne(key, id) {
  const v = await redis.hget(key, id);
  return v ? parse(v) : null;
}

const actions = {
  async saveReq({ req }) {
    const now = new Date().toISOString();
    const id = str(req?.id, 60) || Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    const prev = (await getOne(K.reqs, id)) || {};
    const r = {
      dept: str(req.dept, 60), item: str(req.item, 200), qty: str(req.qty, 100), location: str(req.location, 200),
      neededBy: str(req.neededBy, 20), owner: str(req.owner, 100),
      status: STATUSES.includes(req.status) ? req.status : 'new', budget: !!req.budget, notes: str(req.notes, 1000),
      created: prev.created || now, updated: now,
    };
    if (!r.dept || !r.item) throw Object.assign(new Error('Team and item are required'), { status: 400 });
    await redis.hset(K.reqs, { [id]: JSON.stringify(r) });
    // A team with a requirement has replied
    if (r.status !== 'dropped') {
      const t = await getOne(K.teams, r.dept);
      if (t && !t.home && t.response !== 'needs') await redis.hset(K.teams, { [r.dept]: JSON.stringify({ ...t, response: 'needs' }) });
    }
  },
  async setStatus({ id, status }) {
    const r = await getOne(K.reqs, str(id, 60));
    if (!r || !STATUSES.includes(status)) return;
    await redis.hset(K.reqs, { [id]: JSON.stringify({ ...r, status, updated: new Date().toISOString() }) });
  },
  async deleteReq({ id }) {
    await redis.hdel(K.reqs, str(id, 60));
  },
  async saveTeam({ team }) {
    const t = await getOne(K.teams, str(team?.id, 60));
    if (!t) return;
    const next = { ...t, lead: str(team.lead, 100), phone: str(team.phone, 30), note: str(team.note, 1000), hints: str(team.hints, 1000) };
    if (!t.home) {
      if (REPLIES.includes(team.response)) next.response = team.response;
      next.lastContact = team.lastContact ? new Date(team.lastContact + 'T12:00:00').toISOString() : '';
    }
    await redis.hset(K.teams, { [t.id || team.id]: JSON.stringify(next) });
  },
  async markContacted({ id }) {
    const t = await getOne(K.teams, str(id, 60));
    if (!t) return;
    await redis.hset(K.teams, { [id]: JSON.stringify({ ...t, lastContact: new Date().toISOString() }) });
  },
  async saveSetting({ key, value }) {
    if (!['eventName', 'lastSummaryAt'].includes(key)) throw Object.assign(new Error('Unknown setting'), { status: 400 });
    await redis.hset(K.settings, { [key]: str(value, 200) });
  },
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!redis) return res.status(500).json({ error: 'Storage is not connected. Add Upstash Redis in Vercel → Storage, then redeploy.' });
  try {
    // Cheap live check: one Redis read. The app sends the version it has; full data only when it changed.
    if (req.method === 'GET' && req.query?.since !== undefined) {
      const v = Number(await redis.get(K.version)) || 0;
      if (v > 0 && String(v) === String(req.query.since)) return res.status(200).json({ changed: false, version: v });
    }
    await ensureSeeded();
    if (req.method === 'GET') return res.status(200).json(await readAll());
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (body.action === 'checkPin') return res.status(200).json({ ok: pinOk(body.pin) });
    if (!pinOk(body.pin)) return res.status(401).json({ error: 'PIN_INVALID' });
    const fn = actions[body.action];
    if (!fn) return res.status(400).json({ error: 'Unknown action' });
    await fn(body);
    await redis.incr(K.version);
    return res.status(200).json(await readAll());
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' });
  }
}
