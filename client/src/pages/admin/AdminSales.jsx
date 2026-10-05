import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReceiptText } from 'lucide-react';
import { salesApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner } from '../../components/ui/Spinner';
import { Modal } from '../../components/ui/Modal';
import { formatTZS } from '../../utils/helpers';

const AdminSales = () => {
  const { show } = useToast();
  const { t, tf, lang } = useLanguage();
  const loc = lang === 'sw' ? 'sw-TZ' : 'en-GB';
  const [sales, setSales] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    salesApi.all().then((d) => setSales(d.sales)).catch((e) => show(e.message, 'error'));
  }, []);

  const open = async (s) => {
    try {
      const d = await salesApi.detail(s.id);
      setDetail(d);
    } catch (e) { show(e.message, 'error'); }
  };

  if (!sales) return <Spinner />;
  const revenue = sales.reduce((s, x) => s + Number(x.total || 0), 0);
  const profit = sales.reduce((s, x) => s + Number(x.gross_profit || 0), 0);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.admSales.title}</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5"><p className="text-xs uppercase text-slate-400 font-semibold">{t.pos.admSales.cardSales}</p><p className="font-display text-xl font-bold">{sales.length}</p></div>
        <div className="card p-5"><p className="text-xs uppercase text-slate-400 font-semibold">{t.pos.admSales.cardRevenue}</p><p className="font-display text-xl font-bold">{formatTZS(revenue)}</p></div>
        <div className="card p-5"><p className="text-xs uppercase text-slate-400 font-semibold">{t.pos.admSales.cardGross}</p><p className="font-display text-xl font-bold text-emerald-600">{formatTZS(profit)}</p></div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr className="border-b text-xs uppercase text-slate-400"><th className="p-4">{t.pos.admSales.thDate}</th><th className="p-4">{t.pos.admSales.thShopkeeper}</th><th className="p-4">{t.pos.admSales.thTotal}</th><th className="p-4">{t.pos.admSales.thProfit}</th><th className="p-4">{t.pos.admSales.thAction}</th></tr></thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="p-4 text-xs">{new Date(s.created_at).toLocaleString(loc)}</td>
                <td className="p-4">{s.shopkeeper_name || '—'}</td>
                <td className="p-4 font-bold">{formatTZS(s.total)}</td>
                <td className="p-4 font-bold text-emerald-600">{formatTZS(s.gross_profit)}</td>
                <td className="p-4 flex gap-1"><button onClick={() => open(s)} className="btn-ghost !px-3 !py-1.5 text-xs">{t.pos.admSales.view}</button><Link to={`/admin/sales/${s.id}`} className="btn-ghost inline-flex items-center gap-1 !px-3 !py-1.5 text-xs"><ReceiptText className="h-3.5 w-3.5" />{t.pos.admSales.invoice}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!detail} onClose={() => setDetail(null)} title={t.pos.admSales.detTitle}>
        {detail && (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">{new Date(detail.sale.created_at).toLocaleString(loc)}</p>
            {detail.sale.evidence_photo && <img src={detail.sale.evidence_photo} alt="evidence" className="w-full rounded-xl object-cover" />}
            {detail.items.map((it) => (
              <div key={it.id} className="flex justify-between rounded-xl border border-slate-100 p-3 text-sm">
                <span>{it.product_name} × {it.quantity} @ {formatTZS(it.unit_price)}</span>
                <b>{formatTZS(it.line_total)}</b>
              </div>
            ))}
            <p className="text-right font-bold">{t.pos.common.total} {formatTZS(detail.sale.total)} · {t.pos.admSales.thProfit} {formatTZS(detail.sale.gross_profit)}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminSales;
