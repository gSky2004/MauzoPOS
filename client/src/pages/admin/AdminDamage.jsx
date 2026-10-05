import { useEffect, useState } from 'react';
import { damageApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner } from '../../components/ui/Spinner';

const reasonLabel = (t, r) => ({
  expired: t.pos.dmg.rExpired, damaged: t.pos.dmg.rDamaged, spoiled: t.pos.dmg.rSpoiled,
  broken: t.pos.dmg.rBroken, lost: t.pos.dmg.rLost, other: t.pos.dmg.rOther,
}[r] || r);

const AdminDamage = () => {
  const { show } = useToast();
  const { t, tf, lang } = useLanguage();
  const loc = lang === 'sw' ? 'sw-TZ' : 'en-GB';
  const [list, setList] = useState(null);
  const [showReviewed, setShowReviewed] = useState(false);
  const load = () => {
    damageApi.list().then((d) => setList(d.damages)).catch((e) => show(e.message, 'error'));
  };
  useEffect(() => { load(); }, []);

  const review = async (id) => {
    try { await damageApi.review(id); show(t.pos.dmgAdmin.msgReviewed); load(); }
    catch (e) { show(e.message, 'error'); }
  };

  if (!list) return <Spinner />;
  const visible = showReviewed ? list : list.filter((d) => !d.reviewed);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.dmgAdmin.title}</h1>
        <button onClick={() => setShowReviewed((v) => !v)} className={`rounded-xl px-4 py-2 text-sm font-bold ${showReviewed ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>
          {showReviewed ? t.pos.dmgAdmin.hideReviewed : t.pos.dmgAdmin.showReviewed}
        </button>
      </div>
      {visible.length === 0 && <p className="card p-6 text-sm text-slate-400">{t.pos.dmgAdmin.nothingPending}</p>}
      <div className="grid gap-2">
        {visible.map((d) => (
          <div key={d.id} className="card flex items-center gap-3 p-4">
            {d.photo && <img src={d.photo} alt="" className="h-14 w-14 rounded-xl object-cover" />}
            <div className="flex-1"><p className="text-sm font-bold">{d.product_name} × {d.quantity}</p><p className="text-xs text-slate-400">{reasonLabel(t, d.reason)} · {d.reporter_name || ''} · {new Date(d.created_at).toLocaleDateString(loc)}</p></div>
            {d.reviewed ? <span className="text-xs font-bold text-emerald-600">{t.pos.dmgAdmin.reviewed}</span> : <button onClick={() => review(d.id)} className="btn-ghost !px-3 !py-1.5 text-xs">{t.pos.dmgAdmin.markReviewed}</button>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminDamage;
