import { useEffect, useState } from 'react';
import { posApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner } from '../../components/ui/Spinner';

const AdminActivity = () => {
  const { show } = useToast();
  const { t, tf, lang } = useLanguage();
  const loc = lang === 'sw' ? 'sw-TZ' : 'en-GB';
  const [rows, setRows] = useState(null);
  useEffect(() => {
    posApi.activity().then((d) => setRows(d.activity)).catch((e) => show(e.message, 'error'));
  }, []);
  if (!rows) return <Spinner />;
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.activity.title}</h1>
      <div className="card divide-y divide-slate-100">
        {rows.map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-3 p-4 text-sm">
            <div><p><b>{a.actor_name || t.pos.activity.system}</b> · <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">{a.action}</span></p><p className="text-xs text-slate-400">{a.entity} {a.entity_id}</p></div>
            <span className="shrink-0 text-xs text-slate-400">{new Date(a.created_at).toLocaleString(loc)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminActivity;
