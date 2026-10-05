// POST /api/ai/ask — ADMIN only. The assistant is strictly read-only:
// intents map to approved SELECT functions, and Gemini only ever explains
// verified results. Greetings, refusals and off-topic questions are answered
// locally so they consume zero Gemini quota.
const { query } = require('../db/pool');
const { ApiError } = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const bd = require('../services/businessData');
const { routeQuestion, findMentionedProducts, findMentionedCustomers, has } = require('../services/aiRouter');
const { BIZ_WORDS } = require('../services/aiRouter');
const { askGemini } = require('../services/gemini');

const SW_MARK = /\b(ni|gani|nini|kiasi|ngapi|leo|jana|biashara|duka|pesa|hii|hiki|vipi|tafadhali|habari|mambo|asante|karibu|ndiyo|hapana)\b/;
const isSwahili = (t) => SW_MARK.test(String(t).toLowerCase());

const LOCAL = {
  greeting: {
    en: "Hello! I'm your MauzoOS assistant for M&E Pub. Ask me about sales, stock, expenses, debt or profit — for example: 'How is the business doing today?'",
    sw: "Habari! Mimi ni msaidizi wako wa MauzoOS wa M&E Pub. Niulize kuhusu mauzo, stoo, gharama, madeni au faida — kwa mfano: 'Biashara inaendeleaje leo?'",
  },
  refuse: {
    en: "I can't change business records — I'm read-only and can only explain your data. I can show you the current figures and history instead; make changes from the relevant page (Sales, Inventory, Expenses, Debt/Credit).",
    sw: "Siwezi kubadilisha au kufuta rekodi za biashara — ninasoma tu na kueleza taarifa zako. Naweza kukuonyesha takwimu na historia; fanya mabadiliko kwenye ukurasa husika (Mauzo, Stoo, Gharama, Madeni).",
  },
  offtopic: {
    en: "I'm mainly here to help with your MauzoOS business data. You can ask me about sales, stock, expenses, debt, profit or business performance.",
    sw: "Mimi nipo hapa kukusaidia na taarifa za biashara yako ya MauzoOS. Unaweza kuniuliza kuhusu mauzo, stoo, gharama, madeni, faida au hali ya biashara.",
  },
  down: {
    en: 'AI assistant is temporarily unavailable. Your sales, stock and other MauzoOS features are still working normally.',
    sw: 'Msaidizi wa AI haupatikani kwa sasa. Mauzo, stoo na vipengele vingine vya MauzoOS vinafanya kazi kama kawaida.',
  },
  quota: {
    en: 'The free AI limit has been reached. Please try again later — your sales, stock and other MauzoOS features keep working normally.',
    sw: 'Kiwango cha bure cha AI kimekwisha. Tafadhali jaribu tena baadaye — mauzo, stoo na vipengele vingine vinafanya kazi kama kawaida.',
  },
};

const pick = (obj, sw) => (sw ? obj.sw : obj.en);

const addDays = (d, n) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
};

const ask = asyncHandler(async (req, res) => {
  const question = String(req.body.question || '').trim().slice(0, 500);
  if (!question) throw new ApiError(422, 'Ask a question about your business');
  const sw = isSwahili(question);

  const route = routeQuestion(question);
  if (route.kind === 'greeting') return res.json({ answer: pick(LOCAL.greeting, sw), source: 'local' });
  if (route.kind === 'refuse') return res.json({ answer: pick(LOCAL.refuse, sw), source: 'local' });
  if (route.kind === 'offtopic') return res.json({ answer: pick(LOCAL.offtopic, sw), source: 'local' });

  const intents = new Set(route.intents || []);
  const [prodNames, custNames] = await Promise.all([
    findMentionedProducts(question),
    findMentionedCustomers(question),
  ]);
  const facts = {};
  if (prodNames.length) {
    const seen = new Set();
    facts.product_lookup = [];
    for (const n of prodNames.slice(0, 3)) {
      const rows = await bd.productStock(n);
      for (const r of rows) {
        if (!seen.has(r.name)) { seen.add(r.name); facts.product_lookup.push(r); }
      }
    }
    facts.product_lookup = facts.product_lookup.slice(0, 6);
  } else if (intents.has('product_stock')) {
    // The question is about a specific product, but nothing in the shop
    // records matched it. Say so explicitly instead of guessing.
    facts.product_lookup = [];
    facts.product_search_note = 'No product in the shop records matched this question. Tell the administrator the product could not be found.';
  }
  if (custNames.length) {
    facts.customer_debt = [];
    for (const n of custNames.slice(0, 2)) {
      facts.customer_debt.push(await bd.customerDebt(n));
    }
  } else if (intents.has('debt') && /does .+ owe|\bouwes\b|anadaiwa|deni la/i.test(question)) {
    facts.customer_debt = [];
    facts.customer_search_note = 'No customer in the shop records matched this question. Tell the administrator that customer could not be found.';
  }
  if (intents.size === 0 && has(question.toLowerCase(), ...BIZ_WORDS)) intents.add('overview');
  if (intents.size === 0 && facts.product_lookup?.length === 0 && facts.customer_debt?.length === 0) {
    return res.json({ answer: pick(LOCAL.offtopic, sw), source: 'local' });
  }
  if (intents.size === 0) {
    // A bare product/customer mention with no other signal: still answerable.
    intents.add(facts.product_lookup?.length ? 'product_only' : 'debt');
  }

  const range = await bd.resolveRange(route.range || 'today');
  const { start, end } = range;
  if (intents.has('sales')) {
    facts.sales = await bd.salesSummary(start, end);
    facts.sales_by_payment = await bd.salesByPayment(start, end);
  }
  if (intents.has('profit')) facts.profit = await bd.profitSummary(start, end);
  if (intents.has('expenses')) {
    facts.expenses = await bd.expensesSummary(start, end);
    facts.expenses_by_category = await bd.expensesByCategory(start, end);
  }
  if (intents.has('low')) facts.low_stock = await bd.lowStock();
  if (intents.has('out')) facts.out_of_stock = await bd.outOfStock();
  if (intents.has('expiring')) facts.expiring_soon = await bd.expiring();
  if (intents.has('top')) facts.top_products = await bd.topProducts(start, end);
  if (intents.has('slow')) facts.slow_products = await bd.slowProducts();
  if (intents.has('restock')) {
    facts.restock_priority = await bd.restockPriority();
    const t = await bd.resolveRange('today');
    facts.top_last_30d = await bd.topProducts(addDays(t.start, -29), t.end, 5);
  }
  if (intents.has('debt') || intents.has('customer')) facts.debt = await bd.debtOverview();
  if (intents.has('overview')) {
    if (range.label === 'today') facts.business_today = await bd.businessSummary();
    else {
      facts.profit = await bd.profitSummary(start, end);
      facts.top_products = await bd.topProducts(start, end, 5);
      facts.expenses = await bd.expensesSummary(start, end);
      facts.debt = await bd.debtOverview(5);
    }
  }
  facts.period = { label: range.label, from: start, to: end };

  try {
    const answer = await askGemini({ question, facts, rangeLabel: `${range.label} (${start} to ${end})` });
    return res.json({ answer, source: 'ai' });
  } catch (e) {
    // Provider failures stay provider-side: friendly message, raw error in
    // server logs only (never the key, never the raw provider payload).
    console.error('[ai] gemini failed:', e.code || e.message);
    if (e.code === 'QUOTA') return res.json({ answer: pick(LOCAL.quota, sw), source: 'fallback' });
    return res.json({ answer: pick(LOCAL.down, sw), source: 'fallback' });
  }
});

module.exports = { ask };
