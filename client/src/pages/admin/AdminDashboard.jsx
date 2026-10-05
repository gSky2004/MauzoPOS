import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReceiptText, Banknote, TrendingUp, Wallet, Landmark, Package, TriangleAlert, Clock } from 'lucide-react';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner } from '../../components/ui/Spinner';
import { BarChart } from '../../components/charts/BarChart';
import { formatTZS } from '../../utils/helpers';

const StatCard = ({ label, value, icon: Icon, tint }) => (
  <div className="card group flex items-center gap-4 p-5" title={String(value)}>
    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tint}`}><Icon className="h-6 w-6" /></span>
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="truncate font-display text-xl font-bold text-slate-900 group-hover:whitespace-normal">{value}</p>
    </div>
  </div>
);

const cardTitle = 'font-display font-bold text-slate-900';

const AdminDashboard = () => {
  const [today, setToday] = useState(null);
  const [series, setSeries] = useState([]);
  const { t, tf } = useLanguage();

  useEffect(() => {
    api.get('/analytics/today').then((r) => setToday(r.data)).catch(() => {});
    api.get('/analytics/series?range=7d').then((r) => setSeries(r.data.series)).catch(() => {});
  }, []);

  if (!today) return <Spinner />;

  const revBars = series.map((s) => ({ label: s.label, value: Number(s.revenue) }));
  const netBars = series.map((s) => ({ label: s.label, value: Number(s.net) }));
  const a = today.alerts || {};

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.dash.title}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label={t.pos.dash.sales} value={today.salesCount} icon={ReceiptText} tint="bg-blue-100 text-blue-700" />
        <StatCard label={t.pos.dash.revenue} value={formatTZS(today.revenue)} icon={Banknote} tint="bg-emerald-100 text-emerald-700" />
        <StatCard label={t.pos.dash.gross} value={formatTZS(today.gross)} icon={TrendingUp} tint="bg-violet-100 text-violet-700" />
        <StatCard label={t.pos.dash.expenses} value={formatTZS(today.opex)} icon={Wallet} tint="bg-amber-100 text-amber-700" />
        <StatCard label={t.pos.dash.net} value={formatTZS(today.net)} icon={Landmark} tint={today.net >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'} />
        <StatCard label={t.pos.dash.cogs} value={formatTZS(today.cogs)} icon={Package} tint="bg-slate-200 text-slate-600" />
      </div>

      {(a.lowStock?.length > 0 || a.expiring?.length > 0 || a.pendingExpenses > 0 || a.unreviewedDamage > 0) && (
        <div className="card space-y-1 border-l-4 border-l-red-500 p-5">
          <p className="font-bold text-slate-900">{t.pos.dash.needsAttention}</p>
          {(a.lowStock || []).slice(0, 4).map((p) => (
            <p key={p.id} className="flex items-center gap-2 text-sm"><TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" /><span><Link to="/admin/inventory" className="font-semibold text-green-600">{p.name}</Link> — {tf(t.pos.home.left, { n: p.current_stock })} ({tf(t.pos.dash.reorder, { r: p.reorder_level })})</span></p>
          ))}
          {(a.expiring || []).slice(0, 4).map((p) => (
            <p key={p.id} className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 shrink-0 text-slate-400" /><span>{p.name} — {p.days_left < 0 ? t.pos.inv.expired : tf(t.pos.inv.dLeft, { n: p.days_left })}</span></p>
          ))}
          {a.pendingExpenses > 0 && <p className="flex items-center gap-2 text-sm"><Wallet className="h-4 w-4 shrink-0 text-amber-500" /><Link to="/admin/expenses" className="font-semibold text-green-600">{tf(t.pos.dash.pendingExpenses, { n: a.pendingExpenses })}</Link></p>}
          {a.unreviewedDamage > 0 && <p className="flex items-center gap-2 text-sm"><TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" /><Link to="/admin/damage" className="font-semibold text-green-600">{tf(t.pos.dash.unreviewedDamage, { n: a.unreviewedDamage })}</Link></p>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className={cardTitle}>{t.pos.dash.revChart}</h2>
          <div className="mt-4"><BarChart data={revBars} formatValue={(n) => formatTZS(n)} color="#16a34a" /></div>
        </div>
        <div className="card p-6">
          <h2 className={cardTitle}>{t.pos.dash.netChart}</h2>
          <div className="mt-4"><BarChart data={netBars} formatValue={(n) => formatTZS(n)} color="#22c55e" /></div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
