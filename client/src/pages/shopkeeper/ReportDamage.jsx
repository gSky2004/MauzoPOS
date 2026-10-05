import { useEffect, useState } from 'react';
import { productsApi, damageApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner, ButtonSpinner } from '../../components/ui/Spinner';

const ReportDamage = () => {
  const { show } = useToast();
  const { t, tf } = useLanguage();
  const REASONS = [
    { value: 'expired', label: t.pos.dmg.rExpired },
    { value: 'damaged', label: t.pos.dmg.rDamaged },
    { value: 'spoiled', label: t.pos.dmg.rSpoiled },
    { value: 'broken', label: t.pos.dmg.rBroken },
    { value: 'lost', label: t.pos.dmg.rLost },
    { value: 'other', label: t.pos.dmg.rOther },
  ];
  const [products, setProducts] = useState(null);
  const [form, setForm] = useState({ product_id: '', quantity: 1, reason: 'damaged' });
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadProducts = () => {
    productsApi.list({ limit: 200 }).then((d) => setProducts(d.products)).catch((e) => show(e.message, 'error'));
  };
  useEffect(loadProducts, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!photo) return show(t.pos.dmg.msgPhoto, 'error');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('product_id', form.product_id);
      fd.append('quantity', form.quantity);
      fd.append('reason', form.reason);
      fd.append('photo', photo);
      await damageApi.report(fd);
      show(t.pos.dmg.msgReported);
      setForm({ product_id: '', quantity: 1, reason: 'damaged' });
      setPhoto(null);
      loadProducts();
    } catch (err) { show(err.message, 'error'); } finally { setSaving(false); }
  };

  if (!products) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.dmg.title}</h1>
      <form onSubmit={submit} className="card space-y-3 p-5">
        <div><label className="label">{t.pos.dmg.product}</label><select className="input" required value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}><option value="">{t.pos.dmg.select}</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({tf(t.pos.home.left, { n: p.current_stock })})</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">{t.pos.dmg.quantity}</label><input className="input" type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
          <div><label className="label">{t.pos.dmg.reason}</label><select className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>{REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
        </div>
        <div><label className="label">{t.pos.dmg.photo}</label><input className="input" type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files[0] || null)} /></div>
        <button className="btn-primary w-full !py-4" disabled={saving}>{saving ? <ButtonSpinner /> : t.pos.dmg.submit}</button>
      </form>
    </div>
  );
};

export default ReportDamage;
