// Question router for the AI assistant. Pure keyword logic (English + Swahili)
// that maps a question onto read-only business intents. Gemini is NEVER asked
// to pick data or write queries -- it only explains the verified facts the
// controller gathers for the intents returned here.
const { query } = require('../db/pool');

const has = (t, ...words) => words.some((w) => t.includes(w));

// Mutation attempts: answered locally with a refusal, no Gemini call.
const REFUSE_PATTERNS = [
  /(delete|remove|\bdel\b|futa|ondoa\w*|futia)\b.{0,40}(sale|stock|expense|debt|payment|customer|product|report|mauzo|gharama|deni|mteja|wateja|bidhaa|hisabati|rekodi)/,
  /(change|update|badil\w+|geuza|\bset\b)\b.{0,40}(price|bei|stock|sale|expense|debt|customer|product|discount|pununguza)/,
  /(add|create|make|ongeza|weka|tengeneza|andika)\b.{0,40}(stock|product|sale|expense|debt|payment|customer|user|bidhaa|mauzo|deni|gharama|stoo)/,
  /\brecord\b.{0,30}(sale|payment|expense|stock|mauzo|malipo|gharama|deni)/,
  /(discount|punguza bei|offer|ofa)\b/,
];

// Clearly non-business questions: answered locally, no Gemini call.
const OFFTOPIC_PATTERNS = [
  /capital of|president|rais wa |weather|hali ya hewa|joke|utanani|vichekesho|story|hadithi/,
  /football score|recipe|mapishi|homework|exam|mtihani|music|movie|filamu|wimbo|mchezaji/,
  /meaning of life|who won|nani alishinda/,
];

const GREETING_PATTERNS = [
  /^(hi|hey|hello|hujambo|habari|mambo|shikamoo|niaje|vipi)\b/,
  /^(thanks|thank you|asante|ahsante)\b/,
  /^(who are you|wewe ni nani|what can you do|unaweza nini|help|msaada)\b/,
  /^(bye|kwaheri|later|baadaye)\b/,
];

const RANGE_WORDS = [
  [/yesterday|jana/, 'yesterday'],
  [/last week|wiki iliyopita|wiki lililopita/, 'last_week'],
  [/this week|wiki hii|wiki hiii/, 'this_week'],
  [/last month|mwezi uliopita|mwezi uliopita/, 'last_month'],
  [/this month|mwezi huu|mwezi huuu/, 'this_month'],
  [/today|leo|daily/, 'today'],
];

const BIZ_WORDS = [
  'sale', 'sell', 'sold', 'mauzo', 'uza', 'revenue', 'mapato', 'profit', 'faida', 'stock', 'stoo',
  'expense', 'gharama', 'tumia', 'spend', 'debt', 'deni', 'dai', 'credit', 'customer',
  'mteja', 'wateja', 'product', 'bidhaa', 'business', 'biashara', 'duka', 'shop',
  'money', 'pesa', 'price', 'bei', 'order', 'report', 'ripoti', 'low', 'ndogo',
  'overdue', 'restock', 'mzigo', 'kujumua', 'nunu', 'expir', 'profit margin',
];

// Significant words (>=4 chars) of a name that appear in the question.
const matchNames = (text, names, max = 4) => {
  const lower = String(text).toLowerCase();
  const hits = [];
  for (const name of names) {
    const words = String(name).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    if (words.some((w) => lower.includes(w))) hits.push(name);
    if (hits.length >= max) break;
  }
  return hits;
};

const findMentionedProducts = async (text) => {
  const { rows } = await query(`SELECT name FROM products WHERE status = 'active'`);
  return matchNames(text, rows.map((r) => r.name));
};

const findMentionedCustomers = async (text) => {
  const { rows } = await query('SELECT name FROM shop_customers');
  return matchNames(text, rows.map((r) => r.name));
};

const routeQuestion = (raw) => {
  const text = String(raw || '').toLowerCase().trim();
  if (!text) return { kind: 'invalid' };
  if (GREETING_PATTERNS.some((p) => p.test(text))) return { kind: 'greeting' };
  if (REFUSE_PATTERNS.some((p) => p.test(text))) return { kind: 'refuse' };
  if (OFFTOPIC_PATTERNS.some((p) => p.test(text))) return { kind: 'offtopic' };

  let range = 'today';
  for (const [p, r] of RANGE_WORDS) {
    if (p.test(text)) { range = r; break; }
  }

  const intents = new Set();
  if (has(text, 'profit', 'faida', 'margin')) intents.add('profit');
  if (has(text, 'expense', 'gharama', 'spend', 'tumia', 'spent', 'electricity', 'umeme', 'rent', 'kodi', 'salary', 'mshahara', 'transport', 'usafiri')) intents.add('expenses');
  if (has(text, 'debt', 'deni', 'dai', 'owe', 'credit', 'wateja', 'mteja') || /who owes|nani.*dai|overdue|due/.test(text)) intents.add('debt');
  if (has(text, 'restock', 'mzigo', 'kujumua', 'nunu', 'buy', 'order more', 'agiza', 'running out', 'imekwisha')) intents.add('restock');
  if (has(text, 'expir', 'muda', 'expired')) intents.add('expiring');
  if (has(text, 'out of stock', 'imeisha', 'hakuna stock', 'zero stock', 'out-of-stock')) intents.add('out');
  if (has(text, 'low', 'ndogo', 'chini', 'running low', 'reorder', 'kinaisha')) intents.add('low');
  if (has(text, 'best', 'top', 'sana', 'zaidi', 'leading', 'selling most', 'selling fast', 'fast moving')) intents.add('top');
  if (has(text, 'slow', 'vibaya', 'polepole', 'badly', 'worst', 'poor', 'mbaya', 'haziuzi')) intents.add('slow');
  if (has(text, 'sale', 'sell', 'sold', 'mauzo', 'uza', 'revenue', 'mapato', 'transaction', 'muamala')) intents.add('sales');
  if (has(text, 'business', 'biashara', 'hali', 'overview', 'summary', 'muhtasari', 'concern', 'wasiwasi', 'doing', 'inaendelea', 'focus', 'kipaumbele', 'performance', 'utendaji')) intents.add('overview');
  if (has(text, 'product', 'bidhaa', 'item') && has(text, 'profit', 'faida', 'margin')) intents.add('top');
  // Product-specific questions ("how many X do we have", "do you sell Y").
  // 'restock' contains 'stock' as a substring, so it is excluded explicitly.
  if (!has(text, 'restock', 'mzigo', 'kujumua', 'agiza') && (has(text, 'bottles', 'chupa', 'cans', 'pieces', 'left', 'remain', 'have', 'has', 'ngapi', 'zipo', 'ziko') || /do you (sell|have|stock)/.test(text))) {
    intents.add('product_stock');
  }

  return { kind: 'answer', intents: [...intents], range };
};

module.exports = { routeQuestion, findMentionedProducts, findMentionedCustomers, has, BIZ_WORDS };
