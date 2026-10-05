import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Package, ReceiptText } from 'lucide-react';
import { salesApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatTZS } from '../../utils/helpers';

const ShopkeeperToday = () => {
  const { show } = useToast();
  const { t, tf } = useLanguage();
  const [sales, setSales] = useState(null);

  useEffect(() => {
    salesApi.today().then((d) => setSales(d.sales)).catch((e) => show(e.message, 'error'));
  }, []);

  if (!sales) return <Spinner />;
  const revenue = sales.reduce((s, x) => s + Number(x.total || 0), 0);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.nav.today}</h1>
      <div className="card flex items-center gap-4 p-5">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><Banknote className="h-6 w-6" /></span>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.pos.today.revenueToday}</p><p className="font-display text-xl font-bold">{formatTZS(revenue)} · {sales.length} {t.pos.today.sales}</p></div>
      </div>
      {sales.length === 0 ? <EmptyState icon={<Package className="h-12 w-12 text-slate-300" />} title={t.pos.today.noSales} description={t.pos.today.firstSale} /> : (
        <div className="grid gap-2">
          {sales.map((s) => (
            <Link key={s.id} to={`/shopkeeper/sales/${s.id}`} className="card flex items-center justify-between p-4 transition hover:shadow-lift">
              <div><p className="text-sm font-bold">{t.pos.today.sale} · {tf(t.pos.today.nLines, { n: s.items_count })}</p><p className="text-xs text-slate-400">{new Date(s.created_at).toLocaleTimeString()} · {t.pos.today.tapInvoice} <ReceiptText className="inline h-3.5 w-3.5" /></p></div>
              <p className="font-bold">{formatTZS(s.total)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default ShopkeeperToday;
