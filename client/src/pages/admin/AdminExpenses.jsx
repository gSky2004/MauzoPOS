import { useEffect, useMemo, useState } from 'react';
import { expensesApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner, ButtonSpinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { formatTZS, fmtDay } from '../../utils/helpers';

// pg returns DATE columns as midnight-UTC Dates; slicing the ISO string keeps
// the exact calendar day regardless of the device timezone.
const dayStr = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const AdminExpenses = () => {
  const { show } = useToast();
  const { t, tf, lang } = useLanguage();
  const loc = lang === 'sw' ? 'sw-TZ' : 'en-GB';
  const [expenses, setExpenses] = useState(null);
  const [cats, setCats] = useState([]);
  const [summary, setSummary] = useState(null);
  const [newCat, setNewCat] = useState('');
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [form, setForm] = useState({ category_id: '', amount: '', date: todayStr(), note: '' });
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ category_id: '', amount: '', date: '', note: '' });

  const load = () => {
    expensesApi.list().then((d) => setExpenses(d.expenses)).catch((e) => show(e.message, 'error'));
    expensesApi.categories().then((d) => setCats(d.categories)).catch(() => {});
    expensesApi.summary().then((d) => setSummary(d.summary)).catch(() => {});
  };
  useEffect(load, []);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await expensesApi.create({
        category_id: form.category_id,
        amount: Number(form.amount),
        date: form.date || undefined,
        note: form.note,
      });
      setForm({ category_id: '', amount: '', date: todayStr(), note: '' });
      show(t.pos.exp.msgRecorded);
      load();
    } catch (err) { show(err.message, 'error'); } finally { setSaving(false); }
  };

  const addCat = async (e) => {
    e.preventDefault();
    if (!newCat.trim()) return;
    try {
      await expensesApi.createCategory(newCat.trim());
      setNewCat('');
      show(t.pos.exp.msgCatAdded);
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  const openDetail = (x) => {
    setDetail(x);
    setEditing(false);
    setEditForm({ category_id: x.category_id || '', amount: x.amount, date: dayStr(x.date), note: x.note || '' });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await expensesApi.update(detail.id, {
        category_id: editForm.category_id,
        amount: Number(editForm.amount),
        date: editForm.date || undefined,
        note: editForm.note,
      });
      setDetail(updated.expense);
      setEditing(false);
      show(t.pos.exp.msgUpdated);
      load();
    } catch (err) { show(err.message, 'error'); } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!window.confirm(tf(t.pos.exp.delConfirm, { amount: formatTZS(detail.amount) }))) return;
    try {
      await expensesApi.remove(detail.id);
      setDetail(null);
      show(t.pos.exp.msgDeleted);
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  const filtered = useMemo(() => {
    if (!expenses) return [];
    return expenses.filter((x) => {
      if (catFilter && String(x.category_id) !== String(catFilter)) return false;
      if (dateFilter && dayStr(x.date) !== dateFilter) return false;
      if (q && !`${x.category_name || ''} ${x.note || ''} ${x.creator_name || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [expenses, q, catFilter, dateFilter]);

  if (!expenses) return <Spinner />;

  const renderRow = (x) => (
    <tr key={x.id} className="border-b last:border-0">
      <td className="whitespace-nowrap p-4">{fmtDay(dayStr(x.date), loc)}</td>
      <td className="p-4 font-semibold">{x.category_name || '—'}</td>
      <td className="max-w-[220px] truncate p-4 text-slate-500">{x.note || '—'}</td>
      <td className="whitespace-nowrap p-4 font-bold">{formatTZS(x.amount)}</td>
      <td className="p-4 text-slate-600">{x.creator_name || '—'}</td>
      <td className="p-4"><button onClick={() => openDetail(x)} className="btn-ghost !px-3 !py-1.5 text-xs">{t.pos.exp.view}</button></td>
    </tr>
  );

  const renderCard = (x) => (
    <div key={x.id} className="card space-y-1 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{x.category_name || '—'}</p>
          <p className="truncate text-xs text-slate-400">{x.note || t.pos.exp.noNote} · {x.creator_name || '—'}</p>
        </div>
        <p className="shrink-0 font-display font-bold">{formatTZS(x.amount)}</p>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">{fmtDay(dayStr(x.date), loc)}</p>
        <button onClick={() => openDetail(x)} className="btn-ghost !px-3 !py-1.5 text-xs">{t.pos.exp.view}</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.exp.title}</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.pos.exp.today}</p>
          <p className="font-display text-xl font-bold">{formatTZS(summary?.today)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.pos.exp.week}</p>
          <p className="font-display text-xl font-bold">{formatTZS(summary?.week)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.pos.exp.month}</p>
          <p className="font-display text-xl font-bold">{formatTZS(summary?.month)}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={create} className="card space-y-3 p-5">
          <p className="font-display font-bold text-slate-900">{t.pos.exp.recTitle}</p>
          <div><label className="label">{t.pos.exp.category}</label><select className="input" required value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}><option value="" disabled>{t.pos.exp.selectCat}</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">{t.pos.exp.amount}</label><input className="input" type="number" min="1" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="1,500" /></div>
            <div><label className="label">{t.pos.exp.date}</label><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          </div>
          <div><label className="label">{t.pos.common.noteOpt}</label><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t.pos.exp.notePh} /></div>
          <button className="btn-primary w-full !py-3" disabled={saving}>{saving ? <ButtonSpinner /> : t.pos.exp.saveExpense}</button>
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            {tf(t.pos.exp.stockHint, { inv: t.pos.nav.inventory, rec: t.pos.inv.receiveStock })}
          </p>
        </form>

        <div className="card space-y-3 p-5">
          <p className="font-display font-bold text-slate-900">{t.pos.exp.cats}</p>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => <span key={c.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{c.name}</span>)}
            {cats.length === 0 && <p className="text-sm text-slate-400">{t.pos.exp.noCats}</p>}
          </div>
          <form onSubmit={addCat} className="flex gap-2">
            <input className="input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder={t.pos.exp.newCatPh} />
            <button className="btn-primary shrink-0 !px-4">{t.pos.exp.add}</button>
          </form>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <p className="font-display font-bold text-slate-900">{t.pos.exp.histTitle}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder={t.pos.exp.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
            <option value="">{t.pos.exp.allCats}</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex gap-2">
            <input className="input" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
            {dateFilter && <button onClick={() => setDateFilter('')} className="btn-ghost shrink-0 !px-3 text-xs">{t.pos.exp.clear}</button>}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {filtered.length === 0 && <p className="card p-4 text-sm text-slate-400">{t.pos.exp.noFound}</p>}
        {filtered.map(renderCard)}
      </div>

      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr className="border-b text-xs uppercase text-slate-400"><th className="p-4">{t.pos.exp.thDate}</th><th className="p-4">{t.pos.exp.thCategory}</th><th className="p-4">{t.pos.exp.thNote}</th><th className="p-4">{t.pos.exp.thAmount}</th><th className="p-4">{t.pos.exp.thBy}</th><th className="p-4">{t.pos.exp.thAction}</th></tr></thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6} className="p-4 text-sm text-slate-400">{t.pos.exp.noFound}</td></tr>}
            {filtered.map(renderRow)}
          </tbody>
        </table>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={t.pos.exp.detTitle}>
        {detail && !editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{t.pos.exp.detCategory}</p><p className="font-bold">{detail.category_name || '—'}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{t.pos.exp.detAmount}</p><p className="font-bold">{formatTZS(detail.amount)}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{t.pos.exp.detDate}</p><p className="font-bold">{fmtDay(dayStr(detail.date), loc)}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{t.pos.exp.detBy}</p><p className="font-bold">{detail.creator_name || '—'}</p></div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm"><p className="text-xs text-slate-400">{t.pos.exp.detNote}</p><p>{detail.note || '—'}</p></div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(true)} className="btn-primary flex-1 !py-2.5 text-sm">{t.pos.exp.edit}</button>
              <button onClick={remove} className="btn-ghost flex-1 !py-2.5 text-sm text-red-500">{t.pos.exp.delete}</button>
            </div>
          </div>
        )}
        {detail && editing && (
          <form onSubmit={saveEdit} className="space-y-3">
            <div><label className="label">{t.pos.exp.detCategory}</label><select className="input" required value={editForm.category_id} onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">{t.pos.exp.detAmount} (TZS)</label><input className="input" type="number" min="1" required value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} /></div>
              <div><label className="label">{t.pos.exp.detDate}</label><input className="input" type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} /></div>
            </div>
            <div><label className="label">{t.pos.common.noteOpt}</label><input className="input" value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} /></div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} className="btn-ghost flex-1">{t.pos.common.cancel}</button>
              <button className="btn-primary flex-1" disabled={saving}>{saving ? <ButtonSpinner /> : t.pos.exp.saveChanges}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default AdminExpenses;