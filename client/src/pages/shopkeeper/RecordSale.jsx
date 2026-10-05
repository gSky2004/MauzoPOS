import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote, Smartphone, Landmark, CreditCard, Package } from 'lucide-react';
import { productsApi, salesApi, posApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner, ButtonSpinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatTZS, groupByPrice, packLabel } from '../../utils/helpers';

// Must match METHODS in server/src/controllers/saleController.js exactly,
// otherwise the API rejects the sale with 422.
const METHODS = ['Cash', 'M-Pesa', 'Airtel Money', 'Mixx by Yas', 'HaloPesa', 'Bank', 'Credit'];
const MOBILE = ['M-Pesa', 'Airtel Money', 'Mixx by Yas', 'HaloPesa'];
const ICONS = {
  Cash: Banknote,
  'M-Pesa': Smartphone,
  'Airtel Money': Smartphone,
  'Mixx by Yas': Smartphone,
  HaloPesa: Smartphone,
  Bank: Landmark,
  Credit: CreditCard,
};

const priceOf = (p) => Number(p?.selling_price ?? p?.price ?? 0);

const RecordSale = () => {
  const { show } = useToast();
  const { t, tf, lang } = useLanguage();
  const navigate = useNavigate();
  const [products, setProducts] = useState(null);
  const [q, setQ] = useState('');
  const [lines, setLines] = useState({}); // productId -> qty
  const [qtyInputs, setQtyInputs] = useState({}); // productId -> typed qty
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [method, setMethod] = useState('Cash');
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [txnRef, setTxnRef] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paidAtSale, setPaidAtSale] = useState('');
  const [newCust, setNewCust] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  useEffect(() => {
    productsApi.list({ limit: 200 }).then((d) => setProducts(d.products)).catch((e) => show(e.message, 'error'));
  }, []);

  // Credit customers can only be loaded lazily -- a cash sale should not pay
  // for a customer round-trip.
  useEffect(() => {
    if (method !== 'Credit' || customers.length) return;
    setLoadingCustomers(true);
    posApi
      .customers()
      .then((d) => setCustomers(d.customers || []))
      .catch((e) => show(e.message, 'error'))
      .finally(() => setLoadingCustomers(false));
  }, [method]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLine = (id) => {
    const qty = Math.max(1, parseInt(qtyInputs[id], 10) || 1);
    setLines((l) => ({ ...l, [id]: (l[id] || 0) + qty }));
    setQtyInputs((m) => ({ ...m, [id]: '' }));
  };

  const removeLine = (id) => setLines((l) => {
    const next = { ...l };
    delete next[id];
    return next;
  });

  if (!products) return <Spinner />;
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const entries = Object.entries(lines);
  const total = entries.reduce((s, [id, qty]) => s + priceOf(byId[id]) * qty, 0);
  const filtered = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) && Number(p.current_stock) > 0);
  const isCredit = method === 'Credit';
  const selectedCustomer = customers.find((c) => String(c.id) === String(customerId));

  const methodLabel = (m) => (m === 'Cash' ? t.pos.paymethods.cash : m === 'Credit' ? t.pos.paymethods.credit : m);

  const submit = async () => {
    if (entries.length === 0) return show(t.pos.sale.msgAddProduct, 'error');
    const paid = isCredit ? Math.max(0, Number(paidAtSale) || 0) : 0;
    if (isCredit && paid >= total) return show(t.pos.sale.msgFullPaid, 'error');
    // A credit sale is a promise to pay rather than a handover of goods, so the
    // server accepts it without a photo. Every other method still needs one.
    if (!isCredit && !photo) return show(t.pos.sale.msgPhoto, 'error');
    // Guard locally so we fail fast instead of after the upload round-trip;
    // the server re-checks this anyway.
    for (const [id, qty] of entries) {
      const p = byId[id];
      if (qty > Number(p?.current_stock)) {
        return show(tf(t.pos.sale.msgStockOnly, { name: p.name, n: p.current_stock }), 'error');
      }
    }
    setSaving(true);
    const sold = { ...lines };
    try {
      let cid = customerId;
      if (isCredit && newCust) {
        if (!newName.trim()) { setSaving(false); return show(t.pos.sale.msgEnterName, 'error'); }
        const created = await posApi.createCustomer({ name: newName.trim(), phone: newPhone.trim() });
        cid = created.customer.id;
      }
      if (isCredit && !cid) { setSaving(false); return show(t.pos.sale.msgSelectDebtor, 'error'); }
      const fd = new FormData();
      fd.append('payment_method', method);
      if (isCredit) {
        fd.append('customer_id', cid);
        fd.append('amount_paid', String(paid));
        if (dueDate) fd.append('due_date', dueDate);
      }
      if (MOBILE.includes(method) && txnRef.trim()) fd.append('reference', txnRef.trim());
      fd.append('items', JSON.stringify(entries.map(([product_id, quantity]) => ({ product_id, quantity }))));
      if (photo) fd.append('evidence', photo);
      const { sale } = await salesApi.create(fd);
      show(isCredit
        ? tf(t.pos.sale.recordedDebt, { amount: formatTZS(Number(sale.total) - Number(sale.amount_paid || 0)) })
        : tf(t.pos.sale.recorded, { total: formatTZS(sale.total) }));
      // Update stock and reset the form before navigating, otherwise the
      // setState ran on an unmounted screen and the next sale opened stale.
      setProducts((ps) => ps.map((p) => (sold[p.id] ? { ...p, current_stock: Number(p.current_stock) - sold[p.id] } : p)));
      setLines({});
      setQtyInputs({});
      setPhoto(null);
      setTxnRef('');
      setDueDate('');
      setPaidAtSale('');
      setCustomerId('');
      setNewCust(false);
      setNewName('');
      setNewPhone('');
      navigate(`/shopkeeper/sales/${sale.id}`);
    } catch (e) { show(e.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.sale.title}</h1>
        {entries.length > 0 && (
          <span className="rounded-full bg-green-100 px-4 py-1.5 text-sm font-bold text-green-700">
            {tf(t.pos.sale.nItems, { n: entries.length })} · {formatTZS(total)}
          </span>
        )}
      </div>

      <div className="card p-4">
        <input className="input" placeholder={t.pos.sale.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Package className="h-12 w-12 text-slate-300" />} title={t.pos.sale.noProducts} description={q ? t.pos.sale.noMatch : t.pos.sale.outOfStock} />
      ) : (
        <div className="space-y-6">
          {groupByPrice(filtered, priceOf).map(([price, items]) => (
            <div key={price}>
              <div className="mb-3 flex items-center gap-3">
                <span className="rounded-full bg-slate-900 px-4 py-1.5 font-display text-sm font-bold text-white">{formatTZS(price)}</span>
                <span className="text-xs font-semibold text-slate-400">{tf(t.pos.sale.nItems, { n: items.length })}</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((p) => (
            <div key={p.id} className="card flex flex-col overflow-hidden transition hover:shadow-lift">
              {p.main_image ? (
                <img src={p.main_image} alt={p.name} loading="lazy" decoding="async" className="h-32 w-full object-cover" />
              ) : (
                <div className="grid h-32 w-full place-items-center bg-slate-100"><Package className="h-10 w-10 text-slate-300" /></div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">{p.name}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${Number(p.current_stock) <= 5 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
                    {tf(t.pos.home.left, { n: p.current_stock })}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{packLabel(p, lang)}{p.category_name ? ` · ${p.category_name}` : ''}</p>
                <p className="font-display text-lg font-bold text-green-600">{formatTZS(priceOf(p))}</p>
                {lines[p.id] && (
                  <p className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700">
                    {t.pos.sale.inSale}: {lines[p.id]} × {formatTZS(priceOf(p))} = {formatTZS(priceOf(p) * lines[p.id])}
                  </p>
                )}
                <div className="mt-auto flex gap-2 pt-1">
                  <input
                    className="input !px-3 text-center"
                    type="number"
                    min="1"
                    max={p.current_stock}
                    placeholder={t.pos.sale.qty}
                    value={qtyInputs[p.id] ?? ''}
                    onChange={(e) => setQtyInputs((m) => ({ ...m, [p.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') addLine(p.id); }}
                  />
                  <button onClick={() => addLine(p.id)} className="btn-primary shrink-0 !px-5">
                    {t.pos.sale.add}
                  </button>
                </div>
              </div>
            </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div className="card space-y-4 p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold text-slate-900">{t.pos.sale.confirmSale}</h2>

          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {entries.map(([id, qty]) => (
              <div key={id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="font-semibold text-slate-800">{byId[id]?.name} <span className="text-slate-400">× {qty}</span></span>
                <div className="flex items-center gap-3">
                  <span className="font-bold">{formatTZS(priceOf(byId[id]) * qty)}</span>
                  <button onClick={() => removeLine(id)} className="grid h-7 w-7 place-items-center rounded-full bg-red-50 text-xs font-bold text-red-500 hover:bg-red-100">✕</button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-right font-display text-2xl font-bold text-slate-900">{t.pos.sale.total}: {formatTZS(total)}</p>

          <div>
            <label className="label">{t.pos.sale.payMethod} *</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {METHODS.map((m) => {
                const MethodIcon = ICONS[m];
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-bold transition ${
                      method === m
                        ? 'border-green-600 bg-green-50 text-green-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <MethodIcon className="h-5 w-5" />
                    {methodLabel(m)}
                  </button>
                );
              })}
            </div>
          </div>

          {MOBILE.includes(method) && (
            <div>
              <label className="label">{t.pos.sale.mobRef}</label>
              <input
                className="input"
                placeholder={t.pos.sale.mobRefPh}
                value={txnRef}
                onChange={(e) => setTxnRef(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">{t.pos.sale.mobRefHint}</p>
            </div>
          )}

          {isCredit && (
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
              <label className="label !text-amber-900">{t.pos.sale.customer}</label>
              <div className="mb-2 flex gap-2">
                <button type="button" onClick={() => setNewCust(false)} className={`rounded-xl px-4 py-2 text-sm font-bold ${!newCust ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>{t.pos.sale.existing}</button>
                <button type="button" onClick={() => setNewCust(true)} className={`rounded-xl px-4 py-2 text-sm font-bold ${newCust ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>{t.pos.sale.newCustomer}</button>
              </div>
              {loadingCustomers ? (
                <p className="text-sm text-amber-700">{t.pos.sale.loadingCustomers}</p>
              ) : !newCust && customers.length === 0 ? (
                <p className="text-sm font-semibold text-amber-800">
                  {t.pos.sale.noDebtors}
                </p>
              ) : !newCust ? (
                <>
                  <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                    <option value="">{t.pos.sale.selectCustomer}</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.full_name} {c.phone ? `· ${c.phone}` : ''}
                        {Number(c.balance) > 0 ? ` · ${t.pos.sale.owes} ${formatTZS(c.balance)}` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedCustomer && Number(selectedCustomer.balance) > 0 && (
                    <p className="mt-2 text-sm font-bold text-amber-800">
                      {tf(t.pos.sale.alreadyOwes, { amount: formatTZS(selectedCustomer.balance) })}
                    </p>
                  )}
                </>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className="input" placeholder={t.pos.sale.custNamePh} value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <input className="input" placeholder={t.pos.sale.phoneOpt} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                </div>
              )}

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label !text-amber-900">{t.pos.sale.amountPaid}</label>
                  <input className="input" type="number" min="0" value={paidAtSale} onChange={(e) => setPaidAtSale(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className="label !text-amber-900">{t.pos.sale.dueOpt}</label>
                  <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
              <div className="mt-2 rounded-xl bg-white/70 p-3 text-sm font-bold text-amber-900">
                {t.pos.sale.wTotal} {formatTZS(total)} − {t.pos.sale.wPaid} {formatTZS(Math.max(0, Number(paidAtSale) || 0))} = {t.pos.sale.wDebt} {formatTZS(Math.max(0, total - (Number(paidAtSale) || 0)))}
              </div>
              <p className="mt-1 text-xs text-amber-700">
                {t.pos.sale.dueHint}
              </p>
            </div>
          )}

          <div>
            <label className="label">{isCredit ? t.pos.sale.photoOpt : t.pos.sale.photoReq}</label>
            <input className="input" type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files[0] || null)} />
            {photo && <p className="mt-1 text-xs font-semibold text-emerald-600">✓ {photo.name}</p>}
          </div>

          <button onClick={submit} disabled={saving} className="btn-primary w-full !py-4 text-base">
            {saving ? <ButtonSpinner /> : tf(t.pos.sale.confirmBtn, { total: formatTZS(total), method: methodLabel(method) })}
          </button>
        </div>
      )}
    </div>
  );
};

export default RecordSale;
