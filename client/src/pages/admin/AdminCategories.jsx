import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { categoriesApi } from '../../services/gskyApi';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';

const empty = { name: '', description: '' };

const AdminCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const { show } = useToast();
  const { t, tf } = useLanguage();

  const load = () => {
    categoriesApi.list().then((d) => {
      setCategories(d.categories);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const openCreate = () => {
    setForm(empty);
    setEditing({ mode: 'create' });
  };

  const openEdit = (c) => {
    setForm({ name: c.name, description: c.description || '' });
    setEditing({ mode: 'edit', id: c.id });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing.mode === 'create') await categoriesApi.create(form);
      else await categoriesApi.update(editing.id, form);
      show(editing.mode === 'create' ? t.pos.cats.msgCreated : t.pos.cats.msgUpdated);
      setEditing(null);
      load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm(tf(t.pos.cats.delConfirm, { name: c.name }))) return;
    try {
      await categoriesApi.remove(c.id);
      show(t.pos.cats.msgDeleted);
      load();
    } catch (err) {
      show(err.message, 'error');
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.cats.title}</h1>
        <button onClick={openCreate} className="btn-primary">{t.pos.cats.add}</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <div key={c.id} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display font-bold text-slate-900">{c.name}</h3>
                <p className="mt-1 text-xs text-slate-500">{tf(t.pos.cats.nProducts, { n: c.product_count })}</p>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500"><FolderOpen className="h-5 w-5" /></span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{c.description || t.pos.cats.noDesc}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => openEdit(c)} className="btn-ghost !px-3 !py-1.5 text-xs">{t.pos.cats.edit}</button>
              <button onClick={() => remove(c)} className="btn-ghost !px-3 !py-1.5 text-xs text-red-500">{t.pos.cats.delete}</button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.mode === 'create' ? t.pos.cats.modalAdd : t.pos.cats.modalEdit}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">{t.pos.cats.name}</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="label">{t.pos.cats.description}</label>
            <textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? t.pos.cats.saving : t.pos.cats.save}
          </button>
        </form>
      </Modal>
    </div>
  );
};

export default AdminCategories;
