import { useEffect, useMemo, useState } from 'react';
import { posApi, productsApi, salesApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner, ButtonSpinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { formatTZS, fmtDay, daysUntil } from '../../utils/helpers';

const priceOf = (p) => Number(p?.selling_price ?? p?.price ?? 0);

const statusOf = (s) => (['paid', 'owing', 'due_soon', 'overdue'].includes(s.status) ? s.status : (Number(s.total_remaining) > 0 ? 'owing' : 'paid'));

// What the till needs: who owes, how much, the story behind it, and a way to
// take a payment. No editing of history -- that stays with the admin.
const ShopkeeperDebt = () => {
  const { show } = useToast();
  const { t, tf, lang } = useLanguage();
  const loc = lang === 'sw' ? 'sw-TZ' : 'en-GB';
  const STATUS = {
    paid: { label: t.pos.debt.statusPaid, cls: 'bg-emerald-100 text-emerald-700' },
    owing: { label: t.pos.debt.statusOwing, cls: 'bg-amber-100 text-amber-800' },
    due_soon: { label: t.pos.debt.statusDueSoon, cls: 'bg-orange-100 text-orange-700' },
    overdue: { label: t.pos.debt.statusOverdue, cls: 'bg-red-100 text-red-700' },
  };
  const FILTERS = [
    ['owing', t.pos.debt.fOwing],
    ['due_soon', t.pos.debt.fDueSoon],
    ['overdue', t.pos.debt.fOverdue],
    ['paid', t.pos.debt.fPaid],
    ['all', t.pos.debt.fAll],
  ];
  const PAY_METHODS = [
    { value: 'Cash', label: t.pos.paymethods.cash },
    { value: 'Mobile Money', label: t.pos.paymethods.mobile },
  ];
  const [states, setStates] = useState(null);
  const [filter, setFilter] = useState('owing');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'Cash', note: '' });
  const [saving, setSaving] = useState(false);

  // Record Credit (same sale/inventory/debt logic as Record Sale, without
  // leaving this page)
  const [recOpen, setRecOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [recTab, setRecTab] = useState('existing');
  const [rec, setRec] = useState({ customerId: '', newName: '', newPhone: '', qty: {}, paid: '', due: '', note: '' });
  const [pSearch, setPSearch] = useState('');

  const load = () => {
    posApi.customerAging()
      .then((d) => setStates(d.customers || []))
      .catch((e) => show(e.message, 'error'));
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!recOpen) return;
    posApi.customers().then((d) => setCustomers(d.customers || [])).catch(() => {});
    productsApi.list({ limit: 200 }).then((d) => setProducts(d.products || [])).catch(() => {});
  }, [recOpen]);

  const filtered = useMemo(() => {
    if (!states) return [];
    return states.filter((s) => {
      if (filter !== 'all' && statusOf(s) !== filter) return false;
      if (q && !`${s.customer.name} ${s.customer.phone || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [states, filter, q]);

  const openDetail = async (state) => {
    setDetail({ state, sales: [], payments: [] });
    try {
      const h = await posApi.customerHistory(state.customer.id);
      setDetail({ state, sales: h.sales || [], payments: h.payments || [] });
    } catch (e) { show(e.message, 'error'); }
  };

  const refreshDetail = async (customerId) => {
    const h = await posApi.customerHistory(customerId);
    const aged = await posApi.customerAging();
    setStates(aged.customers || []);
    const next = (aged.customers || []).find((s) => String(s.customer.id) === String(customerId));
    if (next) setDetail({ state: next, sales: h.sales || [], payments: h.payments || [] });
  };

  const submitPay = async (e) => {
    e.preventDefault();
    const amount = Number(payForm.amount);
    const outstanding = Number(detail.state.total_remaining);
    if (!amount || amount <= 0) return show(t.pos.debt.msgEnterAmount, 'error');
    if (amount > outstanding) return show(tf(t.pos.debt.msgTooMuch, { amount: formatTZS(outstanding) }), 'error');
    setSaving(true);
    try {
      const r = await posApi.payCustomer(detail.state.customer.id, amount, payForm.method, payForm.note);
      show(tf(t.pos.debt.msgPaidNew, { amount: formatTZS(r.balance_after) }));
      setPayForm({ amount: '', method: 'Cash', note: '' });
      setPayOpen(false);
      await refreshDetail(detail.state.customer.id);
    } catch (err) { show(err.message, 'error'); } finally { setSaving(false); }
  };

  // ---- Record Credit ----
  const resetRec = () => {
    setRec({ customerId: '', newName: '', newPhone: '', qty: {}, paid: '', due: '', note: '' });
    setPSearch('');
    setRecTab('existing');
  };

  const recLines = useMemo(
    () => products
      .filter((p) => Number(rec.qty[p.id] || 0) > 0)
      .map((p) => ({ ...p, quantity: Number(rec.qty[p.id]) })),
    [products, rec.qty]
  );
  const recTotal = recLines.reduce((s, l) => s + priceOf(l) * l.quantity, 0);
  const recPaid = Math.min(Math.max(0, Number(rec.paid) || 0), recTotal);
  const recCredit = Number((recTotal - recPaid).toFixed(2));

  const bump = (p, delta) => {
    const stock = Number(p.current_stock || 0);
    const next = Math.max(0, Math.min(stock, Number(rec.qty[p.id] || 0) + delta));
    setRec({ ...rec, qty: { ...rec.qty, [p.id]: next } });
  };

  const submitCredit = async (e) => {
    e.preventDefault();
    if (recLines.length === 0) return show(t.pos.debt.msgItems, 'error');
    if (recCredit <= 0) return show(t.pos.debt.msgNoDebtShop, 'error');
    let customerId = rec.customerId;
    if (recTab === 'new') {
      if (!rec.newName.trim()) return show(t.pos.debt.msgEnterName, 'error');
    } else if (!customerId) {
      return show(t.pos.debt.msgSelect, 'error');
    }
    setSaving(true);
    try {
      if (recTab === 'new') {
        const created = await posApi.createCustomer({ name: rec.newName.trim(), phone: rec.newPhone.trim() });
        customerId = created.customer.id;
      }
      await salesApi.create({
        items: recLines.map((l) => ({ product_id: l.id, quantity: l.quantity })),
        payment_method: 'Credit',
        customer_id: customerId,
        amount_paid: recPaid,
        due_date: rec.due || undefined,
        reference: rec.note.trim() || undefined,
      });
      show(tf(t.pos.debt.msgCreditRecorded, { amount: formatTZS(recCredit) }));
      setRecOpen(false);
      resetRec();
      load();
    } catch (err) { show(err.message, 'error'); } finally { setSaving(false); }
  };

  if (!states) return <Spinner />;

  const owingTotal = states.reduce((s, x) => s + Number(x.total_remaining || 0), 0);

  const pSearchResults = pSearch
    ? products.filter((p) => p.name.toLowerCase().includes(pSearch.toLowerCase())).slice(0, 6)
    : products.slice(0, 6);

  const renderCard = (s) => {
    const st = statusOf(s);
    return (
      <div key={s.customer.id} className="card space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-900">{s.customer.name}</p>
            <p className="text-xs text-slate-400">{s.customer.phone || t.pos.debt.noPhone}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[st].cls}`}>{STATUS[st].label}</span>
        </div>
        <p className={`font-display text-xl font-bold ${st === 'paid' ? 'text-emerald-600' : 'text-red-600'}`}>
          {formatTZS(s.total_remaining)}
        </p>
        <button onClick={() => openDetail(s)} className="btn-primary w-full !py-2 text-sm">{t.pos.debt.viewPay}</button>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.debt.title}</h1>
        <button onClick={() => { resetRec(); setRecOpen(true); }} className="btn-primary !px-4 !py-2.5 text-sm">{t.pos.debt.creditSale}</button>
      </div>

      <div className="card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.pos.debt.totalOutstanding}</p>
        <p className="font-display text-2xl font-bold text-red-600">{formatTZS(owingTotal)}</p>
      </div>

      <div className="card space-y-3 p-4">
        <input className="input" placeholder={t.pos.debt.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {[['owing', t.pos.debt.fOwing], ['due_soon', t.pos.debt.fDueSoon], ['overdue', t.pos.debt.fOverdue], ['paid', t.pos.debt.fPaid], ['all', t.pos.debt.fAll]].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-xl px-4 py-2 text-sm font-bold ${filter === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.length === 0 && <p className="card p-4 text-sm text-slate-400">{t.pos.debt.nothingHere}</p>}
        {filtered.map(renderCard)}
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.state.customer.name}>
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3">
              <div>
                <p className="text-xs text-slate-400">{t.pos.debt.detOutstanding}</p>
                <p className="font-display text-2xl font-bold text-red-600">{formatTZS(detail.state.total_remaining)}</p>
                <p className="text-xs text-slate-500">
                  {detail.state.customer.phone || t.pos.debt.noPhone}
                  {detail.state.due_date ? ` · ${tf(t.pos.debt.detDue, { date: fmtDay(detail.state.due_date, loc) })}` : ` · ${t.pos.debt.detNoDue}`}
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS[statusOf(detail.state)].cls}`}>
                {STATUS[statusOf(detail.state)].label}
              </span>
            </div>

            {Number(detail.state.total_remaining) > 0 && (
              <button
                onClick={() => { setPayOpen(true); setPayForm({ amount: '', method: 'Cash', note: '' }); }}
                className="btn-primary w-full !py-2.5 text-sm"
              >
{t.pos.debt.recordPayment}
              </button>
            )}

            <div>
              <p className="text-sm font-bold text-slate-800">{t.pos.debt.detHistory}</p>
              {detail.sales.map((s) => {
                const paid = Number(s.amount_paid || 0);
                const debt = Number((Number(s.total) - paid).toFixed(2));
                return (
                  <div key={s.id} className="mt-2 rounded-xl border border-slate-100 p-3 text-sm">
                    <p className="font-semibold">{new Date(s.created_at).toLocaleDateString(loc)}</p>
                    {(s.items || []).map((it, i) => (
                      <p key={i} className="text-slate-600">{it.name} × {it.quantity}</p>
                    ))}
                    <div className="mt-1 space-y-0.5 border-t border-slate-100 pt-1 text-xs text-slate-500">
                      <p className="flex justify-between"><span>{t.pos.debt.totalSale}</span><b className="text-slate-800">{formatTZS(s.total)}</b></p>
                      <p className="flex justify-between"><span>{t.pos.debt.payPay}</span><b className="text-emerald-600">{formatTZS(paid)}</b></p>
                      <p className="flex justify-between"><span>{t.pos.debt.credit}</span><b className="text-red-600">{formatTZS(debt)}</b></p>
                    </div>
                    {s.shopkeeper_name && <p className="mt-1 text-xs text-slate-400">{tf(t.pos.debt.recordedBy, { name: s.shopkeeper_name })}</p>}
                  </div>
                );
              })}
              {detail.payments.map((p, i) => (
                <div key={p.id || `pay-${p.created_at}-${i}`} className="mt-2 flex items-start justify-between gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-sm">
                  <div>
                    <p className="font-semibold">{new Date(p.created_at).toLocaleDateString(loc)} · {t.pos.debt.payPay} ({p.method === 'Cash' ? t.pos.paymethods.cash : t.pos.paymethods.mobile})</p>
                    {p.recorded_by && <p className="text-xs text-slate-500">{tf(t.pos.debt.takenBy, { name: p.recorded_by })}</p>}
                  </div>
                  <p className="shrink-0 font-bold text-emerald-700">−{formatTZS(p.amount)}</p>
                </div>
              ))}
              {detail.sales.length === 0 && detail.payments.length === 0 && (
                <p className="text-sm text-slate-400">{t.pos.debt.noHistory}</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={t.pos.debt.payTitle}>
        {detail && (
          <form onSubmit={submitPay} className="space-y-3">
            <p className="text-sm text-slate-500">{t.pos.debt.payOutstanding}: <b className="text-slate-900">{formatTZS(detail.state.total_remaining)}</b></p>
            <div>
              <label className="label">{t.pos.debt.payAmount}</label>
              <input className="input" type="number" min="1" max={detail.state.total_remaining} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} placeholder="0" />
            </div>
            <div>
              <label className="label">{t.pos.debt.payRemaining}</label>
              <p className="rounded-xl bg-slate-50 p-3 font-bold text-slate-900">
                {formatTZS(Math.max(0, Number(detail.state.total_remaining) - (Number(payForm.amount) || 0)))}
              </p>
            </div>
            <div>
              <label className="label">{t.pos.debt.payMethod}</label>
              <div className="flex gap-2">
                {PAY_METHODS.map((m) => (
                  <button key={m.value} type="button" onClick={() => setPayForm({ ...payForm, method: m.value })} className={`flex-1 rounded-xl px-4 py-2 text-sm font-bold ${payForm.method === m.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{m.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">{t.pos.common.noteOpt}</label>
              <input className="input" value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPayOpen(false)} className="btn-ghost flex-1">{t.pos.debt.cancel}</button>
              <button className="btn-primary flex-1" disabled={saving}>{saving ? <ButtonSpinner /> : t.pos.debt.payTitle}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------- Record Credit ---------- */}
      <Modal open={recOpen} onClose={() => setRecOpen(false)} title={t.pos.debt.recTitle} wide>
        <form onSubmit={submitCredit} className="space-y-4">
          <div>
            <label className="label">{t.pos.debt.customer}</label>
            <div className="mb-2 flex gap-2">
              <button type="button" onClick={() => setRecTab('existing')} className={`rounded-xl px-4 py-2 text-sm font-bold ${recTab === 'existing' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{t.pos.debt.existing}</button>
              <button type="button" onClick={() => setRecTab('new')} className={`rounded-xl px-4 py-2 text-sm font-bold ${recTab === 'new' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{t.pos.debt.newCustomer}</button>
            </div>
            {recTab === 'existing' ? (
              <select className="input" value={rec.customerId} onChange={(e) => setRec({ ...rec, customerId: e.target.value })}>
                <option value="">{t.pos.debt.selectCustomer}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.phone ? ` · ${c.phone}` : ''}{Number(c.balance) > 0 ? ` · ${t.pos.debt.owes} ${formatTZS(c.balance)}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <input className="input" placeholder={t.pos.debt.newNamePh} value={rec.newName} onChange={(e) => setRec({ ...rec, newName: e.target.value })} />
                <input className="input" placeholder={t.pos.debt.newPhonePh} value={rec.newPhone} onChange={(e) => setRec({ ...rec, newPhone: e.target.value })} />
              </div>
            )}
          </div>

          <div>
            <label className="label">{t.pos.debt.productsTaken}</label>
            <input className="input" placeholder={t.pos.debt.searchProducts} value={pSearch} onChange={(e) => setPSearch(e.target.value)} />
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {pSearchResults.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{p.name} <span className="text-slate-400">· {formatTZS(priceOf(p))} · {tf(t.pos.home.left, { n: p.current_stock })}</span></span>
                  <button type="button" onClick={() => bump(p, 1)} className="btn-primary shrink-0 !px-3 !py-1 text-xs">{t.pos.debt.addBtn}</button>
                </div>
              ))}
            </div>

            {recLines.length > 0 && (
              <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3">
                {recLines.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{l.name} · {formatTZS(priceOf(l))}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => bump(l, -1)} className="btn-ghost !px-2 !py-0.5 text-xs">−</button>
                      <b className="w-6 text-center">{l.quantity}</b>
                      <button type="button" onClick={() => bump(l, 1)} className="btn-ghost !px-2 !py-0.5 text-xs">+</button>
                      <span className="w-24 text-right font-bold">{formatTZS(priceOf(l) * l.quantity)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-slate-50 p-3 text-sm font-bold">
            <p className="flex justify-between"><span className="font-normal text-slate-500">{t.pos.debt.total}</span><span>{formatTZS(recTotal)}</span></p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <label className="font-normal text-slate-500">{t.pos.debt.paidNow}</label>
              <input className="input max-w-[140px] !py-1.5 text-right" type="number" min="0" value={rec.paid} onChange={(e) => setRec({ ...rec, paid: e.target.value })} placeholder="0" />
            </div>
            <p className="mt-1 flex justify-between text-green-800"><span className="font-normal">{t.pos.debt.credit}</span><span>{formatTZS(recCredit)}</span></p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">{t.pos.debt.dueOpt}</label>
              <input className="input" type="date" value={rec.due} onChange={(e) => setRec({ ...rec, due: e.target.value })} />
            </div>
            <div>
              <label className="label">{t.pos.common.noteOpt}</label>
              <input className="input" value={rec.note} onChange={(e) => setRec({ ...rec, note: e.target.value })} />
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => setRecOpen(false)} className="btn-ghost flex-1">{t.pos.debt.cancel}</button>
            <button className="btn-primary flex-1" disabled={saving}>{saving ? <ButtonSpinner /> : 'Record Credit'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ShopkeeperDebt;