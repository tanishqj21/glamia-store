// Amounts are whole INR credits. The ledger and its SQLite triggers own balances.
const emailOf = value => String(value || '').trim().toLowerCase();
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export const indiaCreditDay = (date = new Date()) => new Date(date.getTime() + 330 * 60_000).toISOString().slice(0, 10);

export function creditAuthority(actor, whitelisted = false) {
  const permission = whitelisted || (actor?.role === 'admin' && actor.employee_permissions?.credits === true);
  const position = actor?.employee_position || '';
  return { allowed: Boolean(permission), whitelisted, daily_limit: whitelisted ? null : position === 'admin' ? 10000 : 4000,
    actor_key: actor?.employee_id ? `employee:${actor.employee_id}` : `email:${emailOf(actor?.email)}` };
}

function wholeAmount(raw, { zero = false } = {}) {
  const amount = Number(raw);
  if (raw === null || raw === '' || typeof raw === 'boolean' || !Number.isSafeInteger(amount) || amount < (zero ? 0 : 1)) throw fail('Enter a whole-number credit amount');
  return amount;
}

export async function ensureReferralCode(env, email) {
  email = emailOf(email);
  const current = await env.DB.prepare('SELECT code FROM referral_codes WHERE user_email = ?').bind(email).first();
  if (/^\d{7}$/.test(current?.code || '')) return current.code;
  // Collision retries are bounded; crypto randomness is independent of account identity.
  for (let attempt = 0; attempt < 20; attempt++) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    if (random[0] >= 4293000000) continue; // Rejection sampling avoids modulo bias.
    const code = String(1000000 + random[0] % 9000000);
    if (current) await env.DB.prepare('UPDATE OR IGNORE referral_codes SET code = ? WHERE user_email = ?').bind(code, email).run();
    else await env.DB.prepare('INSERT OR IGNORE INTO referral_codes(code, user_email) VALUES (?, ?)').bind(code, email).run();
    const saved = await env.DB.prepare('SELECT code FROM referral_codes WHERE user_email = ?').bind(email).first();
    if (/^\d{7}$/.test(saved?.code || '')) return saved.code;
  }
  throw fail('Could not generate a referral code. Please retry.', 503);
}

export async function validateReferral(env, email, code) {
  code = String(code || '').trim();
  if (!code) return null;
  if (!/^\d{7}$/.test(code)) throw fail('Enter a valid 7-digit referral code');
  const referrer = await env.DB.prepare('SELECT r.user_email FROM referral_codes r JOIN users u ON u.email = r.user_email WHERE r.code = ?').bind(code).first();
  if (!referrer) throw fail('Referral code was not found');
  if (emailOf(referrer.user_email) === emailOf(email)) throw fail('You cannot refer yourself');
  return { code, email: referrer.user_email };
}

export async function claimSignupReferral(env, email, rawCode = '') {
  email = emailOf(email);
  const code = String(rawCode || '').trim();
  const account = await env.DB.prepare('SELECT referral_onboarding_open FROM users WHERE email = ?').bind(email).first();
  if (!account) throw fail('Registered account not found', 404);
  if (!account.referral_onboarding_open) {
    if (code) throw fail('A referral can only be entered once while creating your account', 409);
    return;
  }
  const referrer = await validateReferral(env, email, code);
  const statements = [];
  if (referrer) statements.push(env.DB.prepare(`INSERT INTO referral_rewards(referred_email, referrer_email, referral_code, status)
    SELECT email, ?, ?, 'pending' FROM users WHERE email = ? AND referral_onboarding_open = 1
    ON CONFLICT(referred_email) DO NOTHING`).bind(referrer.email, referrer.code, email));
  statements.push(env.DB.prepare('UPDATE users SET referral_onboarding_open = 0 WHERE email = ? AND referral_onboarding_open = 1').bind(email));
  await env.DB.batch(statements);
}

export async function creditWallet(env, user, summaryOnly = false) {
  const email = emailOf(user.email);
  const [account, profile] = await env.DB.batch([
    env.DB.prepare('SELECT balance FROM store_credit_accounts WHERE user_email = ?').bind(email),
    env.DB.prepare('SELECT referral_onboarding_open FROM users WHERE email = ?').bind(email)
  ]);
  const result = { balance: Number(account.results?.[0]?.balance || 0), unit_value: 1, currency: 'INR', referral_onboarding_open: Boolean(profile.results?.[0]?.referral_onboarding_open) };
  if (summaryOnly) return result;
  result.referral_code = await ensureReferralCode(env, email);
  const [ledger, counts, claimed, settings] = await env.DB.batch([
    env.DB.prepare('SELECT id, amount, kind, description, order_id, created_at FROM store_credit_ledger WHERE user_email = ? ORDER BY created_at DESC, rowid DESC LIMIT 50').bind(email),
    env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('qualified','legacy_awarded') THEN 1 ELSE 0 END) AS successful FROM referral_rewards WHERE referrer_email = ?").bind(email),
    env.DB.prepare('SELECT referral_code, status FROM referral_rewards WHERE referred_email = ?').bind(email),
    env.DB.prepare('SELECT referral_reward, referred_reward FROM store_credit_settings WHERE id = 1')
  ]);
  return { ...result, ledger: ledger.results || [], referral_count: Number(counts.results?.[0]?.total || 0), successful_referrals: Number(counts.results?.[0]?.successful || 0),
    referred_by: claimed.results?.[0]?.referral_code || null, referral_status: claimed.results?.[0]?.status || null, referral_reward: Number(settings.results?.[0]?.referral_reward || 0), referred_reward: Number(settings.results?.[0]?.referred_reward || 0) };
}

export async function qualifyCreditReferral(env, order) {
  if (!order || order.status === 'cancelled' || order.payment_status !== 'paid' || !['razorpay', 'phonepe', 'store_credit'].includes(order.payment_method) || order.order_type === 'replacement' || Number(order.total) <= 0) return;
  // The order triggers make both rewards atomic with payment settlement. This is a retry fallback.
  await env.DB.prepare(`UPDATE referral_rewards SET status = 'qualified', reward_amount = (SELECT referral_reward FROM store_credit_settings WHERE id = 1),
    referred_reward_amount = (SELECT referred_reward FROM store_credit_settings WHERE id = 1), qualifying_order_id = ?, qualified_at = CURRENT_TIMESTAMP
    WHERE referred_email = ? AND status = 'pending'`)
    .bind(order.id, emailOf(order.customer_email)).run();
}

export async function creditAdminData(env, actor, authority, query = '') {
  if (!authority.allowed) throw fail('Store credits permission is required', 403);
  const day = indiaCreditDay();
  if (query) {
    query = String(query).trim().slice(0, 100);
    if (query.length < 2) return { customers: [] };
    const { results } = await env.DB.prepare(`SELECT u.email, u.name, COALESCE(c.balance,0) AS balance FROM users u
      LEFT JOIN store_credit_accounts c ON c.user_email = u.email WHERE u.email LIKE ? OR u.name LIKE ? ORDER BY u.email LIMIT 20`)
      .bind(`%${query.replace(/[\\%_]/g, '')}%`, `%${query.replace(/[\\%_]/g, '')}%`).all();
    return { customers: results || [] };
  }
  const [settings, daily, ledger, leaderboard, referrals, approvals] = await env.DB.batch([
    env.DB.prepare('SELECT referral_reward, referred_reward, updated_by, updated_at FROM store_credit_settings WHERE id = 1'),
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS granted FROM store_credit_ledger WHERE actor_key = ? AND grant_day = ? AND kind = 'manual'").bind(authority.actor_key, day),
    env.DB.prepare('SELECT l.*, u.name AS customer_name FROM store_credit_ledger l LEFT JOIN users u ON u.email = l.user_email ORDER BY l.created_at DESC, l.rowid DESC LIMIT 60'),
    env.DB.prepare(`SELECT r.referrer_email, u.name, COUNT(*) AS referrals, SUM(CASE WHEN r.status IN ('qualified','legacy_awarded') THEN 1 ELSE 0 END) AS successful,
      SUM(r.reward_amount) AS rewarded FROM referral_rewards r LEFT JOIN users u ON u.email = r.referrer_email GROUP BY r.referrer_email ORDER BY successful DESC, referrals DESC, r.referrer_email LIMIT 50`),
    env.DB.prepare('SELECT * FROM referral_rewards ORDER BY created_at DESC LIMIT 100'),
    env.DB.prepare(`SELECT rr.*, o.order_number FROM return_requests rr JOIN orders o ON o.id = rr.order_id
      WHERE ? = 1 AND rr.type = 'refund' AND rr.refund_destination = 'store_credit' AND rr.credit_approval_status IN ('pending','approved') AND rr.status IN ('requested','approved','received') ORDER BY rr.created_at DESC LIMIT 100`).bind(authority.whitelisted ? 1 : 0)
  ]);
  const granted = Number(daily.results?.[0]?.granted || 0);
  return { settings: settings.results?.[0], authority: { ...authority, day, granted, remaining: authority.daily_limit === null ? null : Math.max(0, authority.daily_limit - granted) },
    ledger: ledger.results || [], leaderboard: leaderboard.results || [], referrals: referrals.results || [], approvals: approvals.results || [] };
}

export async function grantStoreCredits(env, actor, authority, body) {
  if (!authority.allowed) throw fail('Store credits permission is required', 403);
  const email = emailOf(body.email);
  const amount = wholeAmount(body.amount);
  const reason = String(body.reason || '').trim();
  const key = String(body.idempotency_key || '').trim();
  if (!reason || reason.length > 300) throw fail('Add a reason of up to 300 characters');
  if (!/^[A-Za-z0-9_-]{16,120}$/.test(key)) throw fail('A valid credit request token is required');
  const requestKey = `manual:${authority.actor_key}:${key}`;
  const previous = await env.DB.prepare('SELECT * FROM store_credit_ledger WHERE idempotency_key = ?').bind(requestKey).first();
  if (previous) {
    if (previous.user_email !== email || previous.amount !== amount || previous.description !== reason) throw fail('That request token was already used for a different grant', 409);
    return { entry: previous, idempotent: true };
  }
  const customer = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind(email).first();
  if (!customer) throw fail('Choose a registered user', 404);
  try {
    const result = await env.DB.prepare(`INSERT INTO store_credit_ledger(id,user_email,amount,kind,description,actor_key,actor_email,grant_day,daily_limit,idempotency_key)
      VALUES (?,?,?,'manual',?,?,?,?,?,?) ON CONFLICT DO NOTHING`)
      .bind(crypto.randomUUID(), email, amount, reason, authority.actor_key, emailOf(actor.email), indiaCreditDay(), authority.daily_limit, requestKey).run();
    const entry = await env.DB.prepare('SELECT * FROM store_credit_ledger WHERE idempotency_key = ?').bind(requestKey).first();
    if (!entry || entry.user_email !== email || entry.amount !== amount || entry.description !== reason) throw fail('That request token was already used for a different grant', 409);
    return { entry, idempotent: !result.meta?.changes };
  } catch (error) {
    if (/Daily store credit limit/i.test(error.message)) throw fail(`Your daily credit allowance is ₹${authority.daily_limit.toLocaleString('en-IN')}. This grant exceeds the remaining allowance.`, 409);
    throw error;
  }
}

export async function saveCreditSettings(env, actor, authority, body) {
  if (!authority.whitelisted) throw fail('Only a whitelisted admin can change automatic referral rewards', 403);
  const amount = wholeAmount(body.referral_reward, { zero: true });
  const current = await env.DB.prepare('SELECT referred_reward FROM store_credit_settings WHERE id = 1').first();
  const referred = body.referred_reward === undefined ? Number(current.referred_reward) : wholeAmount(body.referred_reward, { zero: true });
  await env.DB.prepare('UPDATE store_credit_settings SET referral_reward = ?, referred_reward = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').bind(amount, referred, emailOf(actor.email)).run();
  return { referral_reward: amount, referred_reward: referred };
}

export async function decideCreditRefund(env, actor, authority, id, decision) {
  if (!authority.whitelisted) throw fail('Only a whitelisted admin can approve refund credits', 403);
  if (!['approved','rejected'].includes(decision)) throw fail('Choose approve or reject');
  const current = await env.DB.prepare("SELECT rr.*, o.total FROM return_requests rr JOIN orders o ON o.id = rr.order_id WHERE rr.id = ? AND rr.type = 'refund' AND rr.refund_destination = 'store_credit'").bind(id).first();
  if (!current) throw fail('Store-credit refund not found', 404);
  if (current.credit_approval_status === 'credited') return { request: current, idempotent: true };
  if (!['requested','approved','received'].includes(current.status)) throw fail('This return is no longer eligible for a credit decision', 409);
  if (!Number.isSafeInteger(current.refund_amount) || current.refund_amount <= 0 || current.refund_amount > current.total) throw fail('Refund amount is invalid', 409);
  if(current.requested_amount_paise!=null && current.refund_amount*100>current.requested_amount_paise) throw fail('Credit refund exceeds selected items',409);
  await env.DB.prepare(`UPDATE return_requests SET credit_approval_status = ?, credit_approved_by = ?, credit_approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND credit_approval_status IN ('pending','approved','rejected') AND status IN ('requested','approved','received')`).bind(decision, emailOf(actor.email), id).run();
  return { request: await env.DB.prepare('SELECT * FROM return_requests WHERE id = ?').bind(id).first() };
}
