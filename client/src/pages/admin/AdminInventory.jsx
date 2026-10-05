import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Package } from 'lucide-react';
import { productsApi, inventoryApi, suppliersApi, restockApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner, ButtonSpinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { formatTZS, unitWord } from '../../utils/helpers';

const unitCostOf = (p) => {
  if (p.unit_cost !== undefined && p.unit_cost !== null && p.unit_cost !== '') return Number(p.unit_cost);
  const buy = Number(p.buying_price || 0);
  const pack = Math.max(1, Number(p.bundle_qty || 1));
  return buy / pack;
};

const profitOf = (p) => {
  if (p.unit_profit !== undefined && p.unit_profit !== null && p.unit_profit !== '') return Number(p.unit_profit);
  return Number(p.selling_price ?? p.price ?? 0) - unitCostOf(p);
};

const statusOf = (p) => {
  const stock = Number(p.current_stock || 0);
  if (stock <= 0) return 'OUT';
  if (stock <= Number(p.reorder_level || 0)) return 'LOW';
  return 'OK';
};

const daysLeftOf = (p) => {
  if (!p.expiry_date) return null;
  return Math.ceil((new Date(p.expiry_date) - new Date()) / 86400000);
};

const packSizeOf = (p) => Math.max(1, Number(p?.bundle_qty || 1));

const AdminInventory = () => {
  const { show } = useToast();
  const { t, tf, lang } = useLanguage();
  const navigate = useNavigate();
  const uw = (u, n = 2) => unitWord(u, n, lang);
  const STATUS = {
    OUT: { label: t.pos.inv.statusOut, pill: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
    LOW: { label: t.pos.inv.statusLow, pill: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
    OK: { label: t.pos.inv.statusOk, pill: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  };
  const moveLabel = (type) => ({
    opening: t.pos.inv.moveOpening, received: t.pos.inv.moveReceived, sale: t.pos.inv.moveSale,
    damaged: t.pos.inv.moveDamaged, adjustment: t.pos.inv.moveAdjustment,
  }[type] || type);
  const ADJUST_REASONS = [
    { value: 'damaged', label: t.pos.inv.reasonDamaged },
    { value: 'expired', label: t.pos.inv.reasonExpired },
    { value: 'missing', label: t.pos.inv.reasonMissing },
    { value: 'personal use', label: t.pos.inv.reasonPersonal },
    { value: 'counting mistake', label: t.pos.inv.reasonCounting },
    { value: 'other', label: t.pos.inv.reasonOther },
  ];
  const [products, setProducts] = useState(null);
  const [restockQueue, setRestockQueue] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveProduct, setReceiveProduct] = useState(null);
  const [receiveForm, setReceiveForm] = useState({ packs: '', buying_price: '', supplier_id: '', expiry_date: '', notes: '' });
  const [receiveSearch, setReceiveSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [adjustFor, setAdjustFor] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ delta: '', reason: 'damaged', note: '' });

  const [detail, setDetail] = useState(null);
  const [movements, setMovements] = useState([]);

  const load = () => {
    productsApi.list({ limit: 200 }).then((d) => setProducts(d.products)).catch((e) => show(e.message, 'error'));
    suppliersApi.list().then((d) => setSuppliers(d.suppliers)).catch(() => {});
    restockApi.list().then((d) => setRestockQueue(d.requests)).catch(() => setRestockQueue([]));
  };
  useEffect(load, []);

  const resolveRestock = async (id) => {
    try {
      await restockApi.resolve(id);
      show(t.pos.inv.msgMarkedDone);
      load();
    } catch (e) { show(e.message, 'error'); }
  };

  const summary = useMemo(() => {
    const list = products || [];
    const out = list.filter((p) => Number(p.current_stock || 0) <= 0);
    const low = list.filter((p) => {
      const s = Number(p.current_stock || 0);
      return s > 0 && s <= Number(p.reorder_level || 0);
    });
    const expiring = list.filter((p) => {
      const d = daysLeftOf(p);
      return d !== null && d <= 30;
    });
    const value = list.reduce((s, p) => s + Number(p.current_stock || 0) * unitCostOf(p), 0);
    return { total: list.length, low, out, expiring, value };
  }, [products]);

  const filtered = useMemo(() => {
    const list = (products || []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    if (filter === 'low') return list.filter((p) => statusOf(p) === 'LOW');
    if (filter === 'out') return list.filter((p) => statusOf(p) === 'OUT');
    if (filter === 'expiring') {
      return list.filter((p) => {
        const d = daysLeftOf(p);
        return d !== null && d <= 30;
      });
    }
    if (filter === 'recent') {
      const cutoff = Date.now() - 30 * 86400000;
      return list.filter((p) => p.created_at && new Date(p.created_at).getTime() >= cutoff);
    }
    return list;
  }, [products, q, filter]);

  // ---- Receive (packs in, units stored) ----
  const openReceive = (p) => {
    setReceiveProduct(p);
    setReceiveForm({
      packs: '',
      buying_price: p.buying_price || '',
      supplier_id: p.supplier_id || '',
      expiry_date: p.expiry_date ? String(p.expiry_date).slice(0, 10) : '',
      notes: '',
    });
    setReceiveOpen(true);
  };

  const packSize = Math.max(1, Number(receiveProduct?.bundle_qty || 1));
  const packQty = Math.max(0, parseInt(receiveForm.packs, 10) || 0);
  const packPrice = Number(receiveForm.buying_price || 0);
  const receiveUnits = packQty * packSize;
  const receiveCost = packQty * packPrice;

  const submitReceive = async (e) => {
    e.preventDefault();
    if (!receiveProduct) return show(t.pos.inv.msgSelectProduct, 'error');
    if (packQty <= 0) return show(t.pos.inv.msgEnterPacks, 'error');
    setSaving(true);
    try {
      await inventoryApi.receive({
        product_id: receiveProduct.id,
        quantity: receiveUnits,
        buying_price: packPrice,
        supplier_id: receiveForm.supplier_id || undefined,
        expiry_date: receiveForm.expiry_date || undefined,
        notes: receiveForm.notes,
      });
      show(tf(t.pos.inv.msgReceived, { n: receiveUnits, u: uw(receiveProduct.unit, receiveUnits) }));
      setReceiveOpen(false);
      setReceiveProduct(null);
      load();
      if (detail && String(detail.id) === String(receiveProduct.id)) openDetail(receiveProduct.id);
    } catch (err) { show(err.message, 'error'); } finally { setSaving(false); }
  };

  // ---- Adjust ----
  const openAdjust = (p) => {
    setAdjustFor(p);
    setAdjustForm({ delta: '', reason: 'damaged', note: '' });
  };

  const submitAdjust = async (e) => {
    e.preventDefault();
    const delta = parseInt(adjustForm.delta, 10);
    if (!Number.isInteger(delta) || delta === 0) return show(t.pos.inv.msgBadDelta, 'error');
    setSaving(true);
    try {
      const { newStock } = await inventoryApi.adjust({
        product_id: adjustFor.id,
        quantity: delta,
        reason: adjustForm.reason,
        note: adjustForm.note,
      });
      show(tf(t.pos.inv.msgAdjusted, { n: newStock, u: uw(adjustFor.unit, newStock) }));
      setAdjustFor(null);
      load();
      if (detail && String(detail.id) === String(adjustFor.id)) openDetail(adjustFor.id);
    } catch (err) { show(err.message, 'error'); } finally { setSaving(false); }
  };

  // ---- History + detail ----
  const loadMovements = async (id) => {
    try {
      const d = await inventoryApi.movements(id);
      setMovements(d.movements || []);
    } catch (e) { show(e.message, 'error'); setMovements([]); }
  };

  const openDetail = async (id) => {
    const p = (products || []).find((x) => String(x.id) === String(id));
    if (!p) return;
    setDetail(p);
    setMovements([]);
    loadMovements(id);
  };

  if (!products) return <Spinner />;

  const alertOut = summary.out;
  const alertLow = summary.low;
  const alertExp = summary.expiring;
  const allClear = alertOut.length === 0 && alertLow.length === 0 && alertExp.length === 0;

  const renderRow = (p) => {
    const st = statusOf(p);
    const d = daysLeftOf(p);
    return (
      <tr key={p.id} className={`border-b last:border-0 ${st !== 'OK' ? 'bg-red-50/50' : ''}`}>
        <td className="p-4">
          <button onClick={() => openDetail(p.id)} className="text-left font-semibold text-slate-900 hover:text-green-700 hover:underline">{p.name}</button>
          <p className="text-xs text-slate-400">{t.pos.inv.pack}: {packSizeOf(p)} {uw(p.unit, packSizeOf(p))}</p>
        </td>
        <td className="p-4 font-bold text-slate-800">{p.current_stock} {uw(p.unit, p.current_stock)}</td>
        <td className="p-4">{formatTZS(p.selling_price ?? p.price)}</td>
        <td className="p-4 text-slate-500">{formatTZS(unitCostOf(p))}</td>
        <td className="p-4 font-bold text-emerald-600">+{formatTZS(profitOf(p))}</td>
        <td className="p-4">
          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[st].pill}`}><span className={`h-1.5 w-1.5 rounded-full ${STATUS[st].dot}`} />{STATUS[st].label}</span>
          {d !== null && d <= 30 && <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><Clock className="h-3 w-3" />{d < 0 ? t.pos.inv.expired : tf(t.pos.inv.dLeft, { n: d })}</p>}
        </td>
        <td className="p-4">
          <div className="flex gap-2">
            <button onClick={() => openReceive(p)} className="btn-primary !px-3 !py-1.5 text-xs">{t.pos.inv.receive}</button>
            <button onClick={() => openDetail(p.id)} className="btn-ghost !px-3 !py-1.5 text-xs">{t.pos.inv.history}</button>
          </div>
        </td>
      </tr>
    );
  };

  const renderCard = (p) => {
    const st = statusOf(p);
    const d = daysLeftOf(p);
    return (
      <div key={p.id} className="card space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <button onClick={() => openDetail(p.id)} className="text-left font-bold text-slate-900">{p.name}</button>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[st].pill}`}><span className={`h-1.5 w-1.5 rounded-full ${STATUS[st].dot}`} />{STATUS[st].label}</span>
        </div>
        <p className="font-display text-xl font-bold">{p.current_stock} {uw(p.unit, p.current_stock)}</p>
        <p className="text-xs text-slate-400">{t.pos.inv.pack}: {packSizeOf(p)} {uw(p.unit, packSizeOf(p))}{d !== null && d <= 30 && ` · ${d < 0 ? t.pos.inv.expired : tf(t.pos.inv.dLeft, { n: d })}`}</p>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">{t.pos.inv.sell} <b className="text-slate-800">{formatTZS(p.selling_price ?? p.price)}</b></span>
          <span className="text-slate-500">{t.pos.inv.cost} <b className="text-slate-800">{formatTZS(unitCostOf(p))}</b></span>
          <span className="font-bold text-emerald-600">+{formatTZS(profitOf(p))}</span>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={() => openReceive(p)} className="btn-primary flex-1 !py-2 text-sm">{t.pos.inv.receive}</button>
          <button onClick={() => openDetail(p.id)} className="btn-ghost flex-1 !py-2 text-sm">{t.pos.inv.history}</button>
        </div>
      </div>
    );
  };

  const receiveCandidates = (products || []).filter((p) => p.name.toLowerCase().includes(receiveSearch.toLowerCase())).slice(0, 8);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.inv.title}</h1>
        <div className="flex gap-2">
          <button onClick={() => navigate('/admin/products/new')} className="btn-ghost !px-4 !py-2.5 text-sm font-bold">{t.pos.inv.addProduct}</button>
          <button onClick={() => { setReceiveProduct(null); setReceiveSearch(''); setReceiveForm({ packs: '', buying_price: '', supplier_id: '', expiry_date: '', notes: '' }); setReceiveOpen(true); }} className="btn-primary !px-4 !py-2.5 text-sm">{t.pos.inv.receiveStock}</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.pos.inv.totalProducts}</p><p className="font-display text-2xl font-bold">{summary.total}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.pos.inv.lowStock}</p><p className="font-display text-2xl font-bold text-amber-600">{summary.low.length}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.pos.inv.outOfStock}</p><p className="font-display text-2xl font-bold text-red-600">{summary.out.length}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.pos.inv.expiringSoon}</p><p className="font-display text-2xl font-bold text-orange-500">{summary.expiring.length}</p></div>
        <div className="card col-span-2 p-4 sm:col-span-1"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.pos.inv.stockValue}</p><p className="font-display text-xl font-bold text-emerald-600">{formatTZS(summary.value)}</p></div>
      </div>

      {restockQueue.length > 0 && (
        <div className="card border-l-4 border-l-green-600 p-4">
          <p className="flex items-center gap-2 font-bold text-slate-900"><Package className="h-5 w-5 text-green-700" />{t.pos.inv.requestedBy}</p>
          {restockQueue.map((r) => (
            <div key={r.id} className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-600"><b>{r.product_name}</b> — {tf(t.pos.home.left, { n: r.current_stock })} · {r.requester_name || ''}</span>
              <button onClick={() => resolveRestock(r.id)} className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs">{t.pos.inv.markDone}</button>
            </div>
          ))}
        </div>
      )}

      <div className="card space-y-2 p-4 sm:p-5">
        <p className="font-display font-bold text-slate-900">{t.pos.inv.alerts}</p>
        {allClear ? (
          <p className="text-sm text-emerald-600">{t.pos.inv.allClear}</p>
        ) : (
          <>
            {alertOut.length > 0 && (
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-red-600"><span className="h-2 w-2 rounded-full bg-red-500" />{t.pos.inv.alertOut} — {tf(alertOut.length === 1 ? t.pos.inv.nProduct1 : t.pos.inv.nProducts, { n: alertOut.length })}</p>
                {alertOut.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                    <span className="text-slate-700">{p.name}</span>
                    <button onClick={() => openReceive(p)} className="btn-primary shrink-0 !px-3 !py-1 text-xs">{t.pos.inv.receive}</button>
                  </div>
                ))}
              </div>
            )}
            {alertLow.length > 0 && (
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-500" />{t.pos.inv.alertLow} — {tf(alertLow.length === 1 ? t.pos.inv.nProduct1 : t.pos.inv.nProducts, { n: alertLow.length })}</p>
                {alertLow.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                    <span className="text-slate-700">{p.name} — <b>{tf(t.pos.home.left, { n: p.current_stock })}</b> ({t.pos.inv.min} {p.reorder_level})</span>
                    <button onClick={() => openReceive(p)} className="btn-primary shrink-0 !px-3 !py-1 text-xs">{t.pos.inv.receive}</button>
                  </div>
                ))}
              </div>
            )}
            {alertExp.length > 0 && (
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-orange-500"><span className="h-2 w-2 rounded-full bg-orange-500" />{t.pos.inv.alertExp} — {tf(alertExp.length === 1 ? t.pos.inv.nProduct1 : t.pos.inv.nProducts, { n: alertExp.length })}</p>
                {alertExp.slice(0, 5).map((p) => {
                  const d = daysLeftOf(p);
                  return <p key={p.id} className="py-0.5 text-sm text-slate-600">{p.name} — {t.pos.inv.expires} {d < 0 ? t.pos.inv.alreadyExpired : tf(t.pos.inv.inDays, { n: d })}</p>;
                })}
              </div>
            )}
          </>
        )}
      </div>

      <div className="card space-y-3 p-4">
        <input className="input" placeholder={t.pos.inv.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {[['all', t.pos.inv.fAll], ['low', t.pos.inv.fLow], ['out', t.pos.inv.fOut], ['expiring', t.pos.inv.fExpiring], ['recent', t.pos.inv.fRecent]].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-xl px-4 py-2 text-sm font-bold ${filter === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {filtered.length === 0 && <p className="card p-4 text-sm text-slate-400">{t.pos.inv.noMatch}</p>}
        {filtered.map(renderCard)}
      </div>

      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead><tr className="border-b text-xs uppercase text-slate-400"><th className="p-4">{t.pos.inv.thProduct}</th><th className="p-4">{t.pos.inv.thStock}</th><th className="p-4">{t.pos.inv.thSell}</th><th className="p-4">{t.pos.inv.thCost}</th><th className="p-4">{t.pos.inv.thProfit}</th><th className="p-4">{t.pos.inv.thStatus}</th><th className="p-4">{t.pos.inv.thAction}</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={7} className="p-4 text-sm text-slate-400">{t.pos.inv.noMatch}</td></tr>}
            {filtered.map(renderRow)}
          </tbody>
        </table>
      </div>

      <Modal open={receiveOpen} onClose={() => setReceiveOpen(false)} title={t.pos.inv.receiveStock}>
        {!receiveProduct ? (
          <div className="space-y-2">
            <input className="input" placeholder={t.pos.inv.recSearchPh} value={receiveSearch} onChange={(e) => setReceiveSearch(e.target.value)} autoFocus />
            {receiveCandidates.map((p) => (
              <button key={p.id} onClick={() => openReceive(p)} className="flex w-full items-center justify-between rounded-xl border border-slate-100 p-3 text-left text-sm hover:bg-slate-50">
                <span className="font-semibold">{p.name}</span>
                <span className="text-xs text-slate-400">{p.current_stock} {uw(p.unit, p.current_stock)}</span>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={submitReceive} className="space-y-3">
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="font-bold">{receiveProduct.name}</p>
              <p className="text-xs text-slate-500">{t.pos.inv.recNow}: {receiveProduct.current_stock} {uw(receiveProduct.unit, receiveProduct.current_stock)} · {t.pos.inv.recPackSize}: {packSize} {uw(receiveProduct.unit, packSize)} · {t.pos.inv.recDateAuto}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">{t.pos.inv.recPacks}</label><input className="input" type="number" min="1" required value={receiveForm.packs} onChange={(e) => setReceiveForm({ ...receiveForm, packs: e.target.value })} placeholder="e.g. 2" /></div>
              <div><label className="label">{t.pos.inv.recPackPrice}</label><input className="input" type="number" min="0" required value={receiveForm.buying_price} onChange={(e) => setReceiveForm({ ...receiveForm, buying_price: e.target.value })} placeholder="e.g. 18000" /></div>
              <div><label className="label">{t.pos.inv.recSupplier}</label><select className="input" value={receiveForm.supplier_id} onChange={(e) => setReceiveForm({ ...receiveForm, supplier_id: e.target.value })}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="label">{t.pos.inv.recExpiry}</label><input className="input" type="date" value={receiveForm.expiry_date} onChange={(e) => setReceiveForm({ ...receiveForm, expiry_date: e.target.value })} /></div>
            </div>
            <div><label className="label">{t.pos.common.noteOpt}</label><input className="input" value={receiveForm.notes} onChange={(e) => setReceiveForm({ ...receiveForm, notes: e.target.value })} placeholder={t.pos.inv.recNotesPh} /></div>
            {packQty > 0 && (
              <div className="rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">
                +{receiveUnits} {uw(receiveProduct.unit, receiveUnits)} · {t.pos.inv.recTotal} {formatTZS(receiveCost)}
                <p className="text-xs font-normal">Stock: {receiveProduct.current_stock} → {Number(receiveProduct.current_stock) + receiveUnits}</p>
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setReceiveProduct(null); }} className="btn-ghost flex-1">{t.pos.inv.recBack}</button>
              <button className="btn-primary flex-1" disabled={saving}>{saving ? <ButtonSpinner /> : t.pos.inv.receiveStock}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!adjustFor} onClose={() => setAdjustFor(null)} title={adjustFor ? `${t.pos.inv.adjTitle} — ${adjustFor.name}` : ''}>
        {adjustFor && (
          <form onSubmit={submitAdjust} className="space-y-3">
            <p className="text-sm text-slate-500">{t.pos.inv.adjCurrent}: <b className="text-slate-900">{adjustFor.current_stock} {uw(adjustFor.unit, adjustFor.current_stock)}</b></p>
            <div><label className="label">{t.pos.inv.adjDelta}</label><input className="input" type="number" required value={adjustForm.delta} onChange={(e) => setAdjustForm({ ...adjustForm, delta: e.target.value })} placeholder="-2" /></div>
            <div><label className="label">{t.pos.inv.adjReason}</label><select className="input" value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}>{ADJUST_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
            <div><label className="label">{t.pos.common.noteOpt}</label><input className="input" value={adjustForm.note} onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })} /></div>
            <p className="text-xs text-slate-400">{t.pos.inv.adjHint}</p>
            <button className="btn-primary w-full" disabled={saving}>{saving ? <ButtonSpinner /> : t.pos.inv.adjSave}</button>
          </form>
        )}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name}>
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{t.pos.inv.detCurrent}</p><p className="font-bold">{detail.current_stock} {uw(detail.unit, detail.current_stock)}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{t.pos.inv.detPack}</p><p className="font-bold">{packSizeOf(detail)} {uw(detail.unit, packSizeOf(detail))}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{t.pos.inv.detSell}</p><p className="font-bold">{formatTZS(detail.selling_price ?? detail.price)}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{t.pos.inv.detCost}</p><p className="font-bold">{formatTZS(unitCostOf(detail))}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{tf(t.pos.inv.detProfitPer, { u: uw(detail.unit, 1) })}</p><p className="font-bold text-emerald-600">+{formatTZS(profitOf(detail))}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{t.pos.inv.detValue}</p><p className="font-bold">{formatTZS(Number(detail.current_stock || 0) * unitCostOf(detail))}</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { setDetail(null); openReceive((products || []).find((p) => String(p.id) === String(detail.id)) || detail); }} className="btn-primary flex-1 !py-2 text-sm">{t.pos.inv.detReceive}</button>
              <button onClick={() => { const p = detail; setDetail(null); openAdjust(p); }} className="btn-ghost flex-1 !py-2 text-sm">{t.pos.inv.detAdjust}</button>
              <button onClick={() => navigate(`/admin/products/${detail.id}`)} className="btn-ghost flex-1 !py-2 text-sm">{t.pos.inv.detEdit}</button>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{t.pos.inv.detActivity}</p>
              {movements.length === 0 && <p className="text-sm text-slate-400">{t.pos.inv.detNoMoves}</p>}
              {movements.slice(0, 20).map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-sm">
                  <div>
                    <p className="font-semibold">{moveLabel(m.type)} <span className={m.qty_delta >= 0 ? 'text-emerald-600' : 'text-red-600'}>{m.qty_delta > 0 ? `+${m.qty_delta}` : m.qty_delta}</span></p>
                    <p className="text-xs text-slate-400">{m.actor_name || ''} · {new Date(m.created_at).toLocaleString()}{m.ref_type === 'adjustment' && m.ref_id ? ` · ${m.ref_id}` : ''}</p>
                  </div>
                  <span className="text-xs font-bold text-slate-500">→ {m.resulting_stock}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminInventory;
