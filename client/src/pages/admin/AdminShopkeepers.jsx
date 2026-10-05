import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { Spinner, ButtonSpinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';

const AdminShopkeepers = () => {
  const { show } = useToast();
  const { t, tf } = useLanguage();
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', role: 'SHOPKEEPER' });
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/admin/shopkeepers').then((r) => setList(r.data.shopkeepers)).catch((e) => show(e.message, 'error'));

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/admin/shopkeepers', form);
      setForm({ full_name: '', email: '', phone: '', password: '', role: 'SHOPKEEPER' });
      show(form.role === 'ADMIN' ? t.pos.staff.createdAdmin : t.pos.staff.createdShop);
      load();
    } catch (err) { show(err.message, 'error'); } finally { setSaving(false); }
  };

  const toggle = async (s) => {
    try {
      await api.put(`/admin/shopkeepers/${s.id}/status`, { status: s.status === 'active' ? 'disabled' : 'active' });
      show(t.pos.staff.statusUpdated);
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  if (!list) return <Spinner />;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.staff.title}</h1>
      <form onSubmit={create} className="card grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
        <div><label className="label">{t.pos.staff.fullName}</label><input className="input" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
        <div><label className="label">{t.pos.staff.email}</label><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><label className="label">{t.pos.staff.phone}</label><input className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><label className="label">{t.pos.staff.password}</label><input className="input" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
        <div><label className="label">{t.pos.staff.role}</label><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="SHOPKEEPER">{t.pos.staff.optShop}</option><option value="ADMIN">{t.pos.staff.optAdmin}</option></select></div>
        <div className="flex items-end"><button className="btn-primary w-full" disabled={saving}>{saving ? <ButtonSpinner /> : t.pos.staff.add}</button></div>
      </form>
      <div className="card overflow-x-auto">
        {list.length === 0 ? <EmptyState icon={<Users className="h-12 w-12 text-slate-300" />} title={t.pos.staff.noStaff} description={t.pos.staff.noStaffDesc} /> : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead><tr className="border-b text-xs uppercase text-slate-400"><th className="p-4">{t.pos.staff.thName}</th><th className="p-4">{t.pos.staff.thEmail}</th><th className="p-4">{t.pos.staff.thPhone}</th><th className="p-4">{t.pos.staff.thRole}</th><th className="p-4">{t.pos.staff.thStatus}</th><th className="p-4">{t.pos.staff.thAction}</th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="p-4 font-semibold">{s.full_name}{String(s.id) === String(user?.id) && <span className="ml-2 text-xs font-normal text-slate-400">{t.pos.staff.you}</span>}</td>
                  <td className="p-4">{s.email}</td>
                  <td className="p-4">{s.phone}</td>
                  <td className="p-4"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.role === 'ADMIN' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>{s.role === 'ADMIN' ? t.pos.staff.admin : t.pos.staff.shopkeeper}</span></td>
                  <td className="p-4"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>{s.status === 'active' ? t.pos.staff.active : t.pos.staff.disabled}</span></td>
                  <td className="p-4">{String(s.id) === String(user?.id)
                    ? <span className="text-xs text-slate-400">{t.pos.staff.current}</span>
                    : <button onClick={() => toggle(s)} className="btn-ghost !px-3 !py-1.5 text-xs">{s.status === 'active' ? t.pos.staff.disable : t.pos.staff.enable}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminShopkeepers;
