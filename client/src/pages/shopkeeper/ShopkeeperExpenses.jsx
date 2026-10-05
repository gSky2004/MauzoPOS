import { useEffect, useState } from 'react';
import { expensesApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { ButtonSpinner } from '../../components/ui/Spinner';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const ShopkeeperExpenses = () => {
  const { show } = useToast();
  const { t, tf } = useLanguage();
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({ category_id: '', amount: '', date: todayStr(), note: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    expensesApi.categories().then((d) => setCats(d.categories)).catch((e) => show(e.message, 'error'));
  }, []);

  const submit = async (e) => {
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
    } catch (err) { show(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.exp.title}</h1>
      <form onSubmit={submit} className="card space-y-3 p-5">
        <div><label className="label">{t.pos.exp.category}</label><select className="input" required value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}><option value="" disabled>{t.pos.exp.selectCat}</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">{t.pos.exp.amount}</label><input className="input" type="number" min="1" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          <div><label className="label">{t.pos.exp.date}</label><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        </div>
        <div><label className="label">{t.pos.common.noteOpt}</label><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        <button className="btn-primary w-full !py-4" disabled={saving}>{saving ? <ButtonSpinner /> : t.pos.exp.saveExpense}</button>
      </form>
    </div>
  );
};

export default ShopkeeperExpenses;