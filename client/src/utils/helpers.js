export const WHATSAPP_NUMBER = '0675029833';

export const whatsappLink = (message) =>
  `https://wa.me/255${WHATSAPP_NUMBER.replace(/^0/, '')}?text=${encodeURIComponent(message)}`;

// Reminder link that opens a chat with the CUSTOMER. whatsappLink() above points
// at the shop's own number, which is the wrong recipient for a debt reminder.
// With no phone on file it falls back to wa.me's contact picker.
export const waChat = (phone, message) => {
  const digits = String(phone || '').replace(/\D/g, '');
  const target = digits ? (digits.startsWith('0') ? `255${digits.slice(1)}` : digits) : '';
  return `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
};

// Due dates arrive as 'YYYY-MM-DD'. Building the date from parts avoids the
// UTC-parsing off-by-one-day that shows an expiry as the day before.
export const fmtDay = (dateStr, locale = 'en-GB') => {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
};

// Whole days from today until the given due date. Negative means overdue.
export const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const due = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86400000);
};

export const DEFAULT_WHATSAPP_MSG =
  'Hello M&E Pub 👋 I would like to make an enquiry.';

export const formatTZS = (n) =>
  `TZS ${Number(n || 0).toLocaleString('en-US')}`;

export const classNames = (...classes) => classes.filter(Boolean).join(' ');

export const groupByPrice = (items, priceOf) => {
  const map = new Map();
  for (const it of items) {
    const key = Number(priceOf(it));
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
};

export const packLabel = (p, lang = 'en') => {
  const n = Number(p?.bundle_qty || 1);
  const unit = p?.unit || 'piece';
  if (lang === 'sw') return n > 1 ? `Pakiti ya ${n} · ${unitWord(unit, n, 'sw')}` : `Moja · ${unitWord(unit, 1, 'sw')}`;
  return n > 1 ? `Pack of ${n} · ${unit}` : `Single · ${unit}`;
};

// Stock-unit word in the UI language. n selects singular/plural where the
// language distinguishes them.
export const unitWord = (unit, n = 2, lang = 'en') => {
  const u = String(unit || 'piece').toLowerCase();
  if (lang === 'sw') {
    const one = Number(n) === 1;
    const map = {
      bottle: 'chupa', can: one ? 'kopo' : 'makopo', piece: one ? 'kipande' : 'vipande',
      pack: 'pakiti', box: one ? 'sanduku' : 'masanduku', sachet: 'sacheti', carton: 'katoni',
    };
    return map[u] || u;
  }
  const map = { bottle: 'bottles', can: 'cans', piece: 'pieces', pack: 'packs', box: 'boxes', sachet: 'sachets', carton: 'cartons' };
  return map[u] || `${u}s`;
};

