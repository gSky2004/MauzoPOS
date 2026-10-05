import { useEffect, useState } from 'react';
import { TrendingUp, Banknote, PiggyBank, TrendingDown } from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner } from '../../components/ui/Spinner';
import { BarChart } from '../../components/charts/BarChart';
import { formatTZS } from '../../utils/helpers';

const Rank = ({ icon: Icon, title, rows, value, noData }) => (
  <div className="card p-5">
    <p className="flex items-center gap-2 font-display font-bold text-slate-900"><Icon className="h-5 w-5 text-green-700" />{title}</p>
    <div className="mt-3 space-y-2">
      {rows.length === 0 && <p className="text-sm text-slate-400">{noData}</p>}
      {rows.map((r, i) => (
        <div key={r.id || r.method || i} className="flex items-center justify-between text-sm">
          <span><b className="text-slate-400">{i + 1}.</b> {r.name || r.method}</span>
          <b>{value(r)}</b>
        </div>
      ))}
    </div>
  </div>
);

const AdminAnalytics = () => {
  const { show } = useToast();
  const { t, tf } = useLanguage();
  const [range, setRange] = useState('30d');
  const [series, setSeries] = useState([]);
  const [prods, setProds] = useState(null);

  useEffect(() => {
    api.get(`/analytics/series?range=${range}`).then((r) => setSeries(r.data.series)).catch((e) => show(e.message, 'error'));
  }, [range]);
  useEffect(() => {
    api.get('/analytics/products').then((r) => setProds(r.data)).catch((e) => show(e.message, 'error'));
  }, []);

  if (!prods) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.analytics.title}</h1>
        <div className="flex gap-2">
          {['7d', '30d', '6m'].map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`rounded-xl px-4 py-2 text-sm font-bold ${range === r ? 'bg-slate-900 text-white' : 'bg-white'}`}>{r}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6"><p className="font-display font-bold">{tf(t.pos.analytics.revChart, { r: range })}</p><div className="mt-4"><BarChart data={series.map((s) => ({ label: s.label, value: Number(s.revenue) }))} formatValue={(n) => formatTZS(n)} color="#16a34a" /></div></div>
        <div className="card p-6"><p className="font-display font-bold">{tf(t.pos.analytics.netChart, { r: range })}</p><div className="mt-4"><BarChart data={series.map((s) => ({ label: s.label, value: Number(s.net) }))} formatValue={(n) => formatTZS(n)} color="#22c55e" /></div></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Rank icon={TrendingUp} title={t.pos.analytics.bestSelling} rows={prods.bestSelling} value={(r) => tf(t.pos.analytics.sold, { n: r.units })} noData={t.pos.analytics.noData} />
        <Rank icon={Banknote} title={t.pos.analytics.highestRevenue} rows={prods.highestRevenue} value={(r) => formatTZS(r.revenue)} noData={t.pos.analytics.noData} />
        <Rank icon={PiggyBank} title={t.pos.analytics.mostProfitable} rows={prods.mostProfitable} value={(r) => formatTZS(r.profit)} noData={t.pos.analytics.noData} />
        <Rank icon={TrendingDown} title={t.pos.analytics.slowMoving} value={(r) => `${tf(t.pos.analytics.sold, { n: r.units })} · ${tf(t.pos.home.left, { n: r.current_stock })}`} rows={prods.slowMoving} noData={t.pos.analytics.noData} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr className="border-b text-xs uppercase text-slate-400"><th className="p-4">{t.pos.analytics.thProduct}</th><th className="p-4">{t.pos.analytics.thUnits}</th><th className="p-4">{t.pos.analytics.thRevenue}</th><th className="p-4">{t.pos.analytics.thCogs}</th><th className="p-4">{t.pos.analytics.thProfit}</th><th className="p-4">{t.pos.analytics.thMargin}</th></tr></thead>
          <tbody>
            {prods.table.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-4 font-semibold">{r.name}</td>
                <td className="p-4">{r.units}</td>
                <td className="p-4">{formatTZS(r.revenue)}</td>
                <td className="p-4">{formatTZS(r.cogs)}</td>
                <td className="p-4 font-bold text-emerald-600">{formatTZS(r.profit)}</td>
                <td className="p-4">{Number(r.margin).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminAnalytics;
