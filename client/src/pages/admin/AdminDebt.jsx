import { useEffect, useMemo, useState } from 'react';
import { posApi, productsApi, salesApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner, ButtonSpinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { formatTZS, waChat, fmtDay, daysUntil } from '../../utils/helpers';

const priceOf = (p) => Number(p?.selling_price ?? p?.price ?? 0);

const statusOf = (s) => (['paid', 'owing', 'due_soon', 'overdue'].includes(s.status) ? s.status : (Number(s.total_remaining) > 0 ? 'owing' : 'paid'));

const AdminDebt = () => {
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
    ['all', t.pos.debt.fAll],
    ['owing', t.pos.debt.fOwing],
    ['due_soon', t.pos.debt.fDueSoon],
    ['overdue', t.pos.debt.fOverdue],
    ['paid', t.pos.debt.fPaid],
  ];
  const PAY_METHODS = [
    { value: 'Cash', label: t.pos.paymethods.cash },
    { value: 'Mobile Money', label: t.pos.paymethods.mobile },
  ];
  const [states, setStates] = useState(null);
  const [totals, setTotals] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  // Record Credit
  const [recOpen, setRecOpen] = useState(false);
  const [recTab, setRecTab] = useState('existing');
  const [rec, setRec] = useState({ customerId: '', newName: '', newPhone: '', qty: {}, paid: '', due: '', note: '' });
  const [pSearch, setPSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Detail + payment
  const [detail, setDetail] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'Cash', note: '' });
  const [payResult, setPayResult] = useState(null);

  const load = () => {
    posApi.customerAging()
      .then((d) => {
        setStates(d.customers || []);
        setTotals(d.totals || null);
      })
      .catch((e) => show(e.message, 'error'));
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!recOpen) return;
    posApi.customers().then((d) => setCustomers(d.customers || [])).catch(() => {});
    productsApi.list({ limit: 200 }).then((d) => setProducts(d.products || [])).catch(() => {});
  }, [recOpen]);

  const resetRec = () => {
    setRec({ customerId: '', newName: '', newPhone: '', qty: {}, paid: '', due: '', note: '' });
    setPSearch('');
    setRecTab('existing');
  };

  const filtered = useMemo(() => {
    if (!states) return [];
    return states.filter((s) => {
      if (filter !== 'all' && statusOf(s) !== filter) return false;
      if (q && !`${s.customer.name} ${s.customer.phone || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [states, filter, q]);

  // ---- Record Credit ----
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
    if (recCredit <= 0) return show(t.pos.debt.msgNoDebt, 'error');
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

  // ---- Detail + payment ----
  const openDetail = async (state) => {
    setDetail({ state, sales: [], payments: [] });
    setPayResult(null);
    try {
      const h = await posApi.customerHistory(state.customer.id);
      setDetail({ state, sales: h.sales || [], payments: h.payments || [] });
    } catch (e) { show(e.message, 'error'); }
  };

  const refreshDetail = async (customerId) => {
    const h = await posApi.customerHistory(customerId);
    const aged = await posApi.customerAging();
    setStates(aged.customers || []);
    setTotals(aged.totals || null);
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
      setPayResult({ previous: r.previous_balance, paid: r.amount, remaining: r.balance_after });
      show(t.pos.debt.msgPaid);
      setPayForm({ amount: '', method: 'Cash', note: '' });
      await refreshDetail(detail.state.customer.id);
    } catch (err) { show(err.message, 'error'); } finally { setSaving(false); }
  };

  const reminder = useMemo(() => {
    if (!detail) return '';
    const c = detail.state.customer;
    const due = detail.state.due_date;
    const bits = [
      tf(t.pos.debt.remHello, { name: c.name }),
      tf(t.pos.debt.remBalance, { amount: formatTZS(detail.state.total_remaining) }),
    ];
    if (due) bits.push(tf(t.pos.debt.remDue, { date: fmtDay(due, loc) }));
    bits.push(t.pos.debt.remThanks);
    return bits.join(' ');
  }, [detail, t, loc]);

  const sendWhatsApp = () => {
    window.open(waChat(detail?.state?.customer?.phone, reminder), '_blank', 'noopener');
  };

  const reversePay = async (p) => {
    if (!window.confirm(tf(t.pos.debt.reverseConfirm, { amount: formatTZS(p.amount) }))) return;
    try {
      await posApi.reversePayment(detail.state.customer.id, p.id);
      show(t.pos.debt.reversed);
      await refreshDetail(detail.state.customer.id);
    } catch (err) { show(err.message, 'error'); }
  };

  const copyReminder = async () => {
    try {
      await navigator.clipboard?.writeText(reminder);
      show(t.pos.debt.msgCopied);
    } catch { show(t.pos.debt.msgCopyFail, 'error'); }
  };

  if (!states) return <Spinner />;

  const tt = totals || {};
  const pSearchResults = pSearch
    ? products.filter((p) => p.name.toLowerCase().includes(pSearch.toLowerCase())).slice(0, 6)
    : products.slice(0, 6);

  const renderRow = (s) => {
    const st = statusOf(s);
    const due = s.due_date;
    const days = daysUntil(due);
    return (
      <tr key={s.customer.id} className="border-b last:border-0">
        <td className="p-4 font-semibold text-slate-900">{s.customer.name}</td>
        <td className="p-4 text-slate-600">{s.customer.phone || '—'}</td>
        <td className={`p-4 font-bold ${st === 'paid' ? 'text-emerald-600' : 'text-red-600'}`}>
          {formatTZS(s.total_remaining)}
        </td>
        <td className="p-4 text-slate-600">
          {due ? fmtDay(due, loc) : '—'}
          {days !== null && st !== 'paid' && (
            <span className={`ml-1 text-xs ${days < 0 ? 'text-red-500' : 'text-slate-400'}`}>
              {days < 0 ? tf(t.pos.debt.dueLate, { n: Math.abs(days) }) : days === 0 ? t.pos.debt.today : tf(t.pos.debt.inDays, { n: days })}
            </span>
          )}
        </td>
        <td className="p-4"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[st].cls}`}>{STATUS[st].label}</span></td>
        <td className="p-4">
          <button onClick={() => openDetail(s)} className="btn-ghost whitespace-nowrap !px-3 !py-1.5 text-xs">{t.pos.debt.viewPay}</button>
        </td>
      </tr>
    );
  };

  const renderCard = (s) => {
    const st = statusOf(s);
    const due = s.due_date;
    const days = daysUntil(due);
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
        <p className="text-xs text-slate-400">
          {due ? `${tf(t.pos.debt.dueOn, { date: fmtDay(due, loc) })}${days !== null && days < 0 ? ` · ${tf(t.pos.debt.dueLate, { n: Math.abs(days) })}` : ''}` : t.pos.debt.noDueDate}
        </p>
        <button onClick={() => openDetail(s)} className="btn-primary w-full !py-2 text-sm">{t.pos.debt.viewPay}</button>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.debt.title}</h1>
        <button
          onClick={() => { resetRec(); setRecOpen(true); }}
          className="btn-primary !px-4 !py-2.5 text-sm"
        >
          {t.pos.debt.recCredit}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.pos.debt.outstanding}</p>
          <p className="font-display text-xl font-bold text-red-600">{formatTZS(tt.outstanding)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.pos.debt.customersOwing}</p>
          <p className="font-display text-2xl font-bold">{tt.owing || 0}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.pos.debt.overdue}</p>
          <p className="font-display text-xl font-bold text-red-600">{formatTZS(tt.overdue_amount)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.pos.debt.dueSoon}</p>
          <p className="font-display text-xl font-bold text-orange-500">{formatTZS(tt.due_soon_amount)}</p>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <input className="input" placeholder={t.pos.debt.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${filter === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {filtered.length === 0 && <p className="card p-4 text-sm text-slate-400">{t.pos.debt.nothingHere}</p>}
        {filtered.map(renderCard)}
      </div>

      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-slate-400">
              <th className="p-4">{t.pos.debt.thCustomer}</th>
              <th className="p-4">{t.pos.debt.thPhone}</th>
              <th className="p-4">{t.pos.debt.thOutstanding}</th>
              <th className="p-4">{t.pos.debt.thDue}</th>
              <th className="p-4">{t.pos.debt.thStatus}</th>
              <th className="p-4">{t.pos.debt.thAction}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-sm text-slate-400">{t.pos.debt.nothingHere}</td></tr>
            )}
            {filtered.map(renderRow)}
          </tbody>
        </table>
      </div>

      {states.length === 0 && (
        <div className="card p-6 text-center">
          <p className="font-display font-bold text-slate-900">{t.pos.debt.noDebts}</p>
          <p className="mt-1 text-sm text-slate-500">
            {t.pos.debt.noDebtsDesc}
          </p>
        </div>
      )}

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
            <label className="label">{t.pos.debt.items}</label>
            <input className="input" placeholder={t.pos.debt.searchProducts} value={pSearch} onChange={(e) => setPSearch(e.target.value)} />
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {pSearchResults.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{p.name} <span className="text-slate-400">· {formatTZS(priceOf(p))} · {p.current_stock} left</span></span>
                  <button type="button" onClick={() => bump(p, 1)} className="btn-primary shrink-0 !px-3 !py-1 text-xs">+</button>
                </div>
              ))}
            </div>

            {recLines.length > 0 && (
              <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3">
                {recLines.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => bump(l, -1)} className="btn-ghost !px-2 !py-0.5 text-xs">−</button>
                      <b className="w-6 text-center">{l.quantity}</b>
                      <button type="button" onClick={() => bump(l, 1)} className="btn-ghost !px-2 !py-0.5 text-xs">+</button>
                      <span className="w-24 text-right font-bold">{formatTZS(priceOf(l) * l.quantity)}</span>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold">
                  <span>{t.pos.debt.totalSale}</span><span>{formatTZS(recTotal)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">{t.pos.debt.amountPaid}</label>
              <input className="input" type="number" min="0" value={rec.paid} onChange={(e) => setRec({ ...rec, paid: e.target.value })} placeholder="0" />
            </div>
            <div>
              <label className="label">{t.pos.debt.dueOpt}</label>
              <input className="input" type="date" value={rec.due} onChange={(e) => setRec({ ...rec, due: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="label">{t.pos.debt.noteOpt}</label>
            <input className="input" value={rec.note} onChange={(e) => setRec({ ...rec, note: e.target.value })} placeholder={t.pos.debt.notePh} />
          </div>

          <div className="rounded-xl bg-green-50 p-3 text-sm font-bold text-green-800">
            {t.pos.debt.creditAmount}: {formatTZS(recCredit)}
            <p className="text-xs font-normal text-green-700">{tf(t.pos.debt.totalPaidLine, { total: formatTZS(recTotal), paid: formatTZS(recPaid) })}</p>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={() => setRecOpen(false)} className="btn-ghost flex-1">{t.pos.debt.cancel}</button>
            <button className="btn-primary flex-1" disabled={saving}>{saving ? <ButtonSpinner /> : t.pos.debt.saveCredit}</button>
          </div>
        </form>
      </Modal>

      {/* ---------- Customer debt detail ---------- */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.state.customer.name} wide>
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

            <div className="flex flex-wrap gap-2">
              {Number(detail.state.total_remaining) > 0 && (
                <button
                  onClick={() => { setPayOpen(true); setPayForm({ amount: '', method: 'Cash', note: '' }); setPayResult(null); }}
                  className="btn-primary flex-1 !py-2.5 text-sm"
                >
{t.pos.debt.recordPayment}
                </button>
              )}
              <button onClick={sendWhatsApp} className="btn-ghost flex-1 !py-2.5 text-sm">{t.pos.debt.whatsapp}</button>
              <button onClick={copyReminder} className="btn-ghost flex-1 !py-2.5 text-sm">{t.pos.debt.copyMsg}</button>
            </div>

            {payResult && (
              <div className="space-y-1 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                <p>{t.pos.debt.payPrev}: {formatTZS(payResult.previous)}</p>
                <p>{t.pos.debt.payPay}: −{formatTZS(payResult.paid)}</p>
                <p>{t.pos.debt.payNew}: {formatTZS(payResult.remaining)}</p>
              </div>
            )}

            <div>
              <p className="text-sm font-bold text-slate-800">{t.pos.debt.detHistory}</p>
              {detail.sales.map((s) => {
                const debt = Number((Number(s.total) - Number(s.amount_paid || 0)).toFixed(2));
                return (
                  <div key={s.id} className="mt-2 rounded-xl border border-slate-100 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{new Date(s.created_at).toLocaleDateString(loc)}</p>
                        {(s.items || []).map((it, i) => (
                          <p key={i} className="text-slate-600">{it.name} × {it.quantity}</p>
                        ))}
                        {s.reference && <p className="text-xs italic text-slate-400">{s.reference}</p>}
                        {s.shopkeeper_name && <p className="text-xs text-slate-400">{tf(t.pos.debt.recordedBy, { name: s.shopkeeper_name })}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-bold text-red-600">+{formatTZS(debt)}</p>
                        {Number(s.amount_paid) > 0 && (
                          <p className="text-xs text-emerald-600">{tf(t.pos.debt.paidAtSale, { amount: formatTZS(s.amount_paid) })}</p>
                        )}
                        {s.due_date && <p className="text-xs text-slate-400">{tf(t.pos.debt.detDue, { date: fmtDay(s.due_date, loc) })}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {detail.payments.map((p, i) => (
                <div key={p.id || `pay-${p.created_at}-${i}`} className="mt-2 flex items-start justify-between gap-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-sm">
                  <div>
                    <p className="font-semibold">{new Date(p.created_at).toLocaleDateString(loc)} · {t.pos.debt.payPay} ({p.method === 'Cash' ? t.pos.paymethods.cash : t.pos.paymethods.mobile})</p>
                    {p.note && <p className="text-xs italic text-slate-500">{p.note}</p>}
                    {p.recorded_by && <p className="text-xs text-slate-500">{tf(t.pos.debt.takenBy, { name: p.recorded_by })}</p>}
                    {p.id && (
                      <button
                        onClick={() => reversePay(p)}
                        className="mt-1 text-xs font-bold text-red-500 underline"
                      >
                        {t.pos.debt.reverse}
                      </button>
                    )}
                  </div>
                  <p className="shrink-0 font-bold text-emerald-700">−{formatTZS(p.amount)}</p>
                </div>
              ))}
              {detail.sales.length === 0 && detail.payments.length === 0 && (
                <p className="text-sm text-slate-400">{t.pos.debt.noHistory}</p>
              )}
            </div>

            <div className="flex justify-between rounded-xl bg-slate-900 p-3 text-sm font-bold text-white">
              <span>{t.pos.debt.currentBalance}</span>
              <span>{formatTZS(detail.state.total_remaining)}</span>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------- Record Payment ---------- */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={t.pos.debt.payTitle}>
        {detail && (
          <form onSubmit={submitPay} className="space-y-3">
            <p className="text-sm text-slate-500">{t.pos.debt.payOutstanding}: <b className="text-slate-900">{formatTZS(detail.state.total_remaining)}</b></p>
            <div>
              <label className="label">{t.pos.debt.payAmount}</label>
              <input className="input" type="number" min="1" max={detail.state.total_remaining} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} placeholder="0" />
              <div className="mt-1 flex gap-2">
                <button type="button" onClick={() => setPayForm({ ...payForm, amount: String(detail.state.total_remaining) })} className="btn-ghost !px-2 !py-1 text-xs">{t.pos.debt.payAll}</button>
                <button type="button" onClick={() => setPayForm({ ...payForm, amount: String((Number(detail.state.total_remaining) / 2).toFixed(2)) })} className="btn-ghost !px-2 !py-1 text-xs">{t.pos.debt.payHalf}</button>
              </div>
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
              <label className="label">{t.pos.debt.noteOpt}</label>
              <input className="input" value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPayOpen(false)} className="btn-ghost flex-1">{t.pos.debt.cancel}</button>
              <button className="btn-primary flex-1" disabled={saving}>{saving ? <ButtonSpinner /> : t.pos.debt.payTitle}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default AdminDebt;