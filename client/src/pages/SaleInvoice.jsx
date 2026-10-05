import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { salesApi } from '../services/gskyApi';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { Spinner } from '../components/ui/Spinner';
import { formatTZS } from '../utils/helpers';

const SHOP = {
  name: 'M&E PUB',
  phone: '0767512482',
  address: 'Mbeya, Isyesye',
};

const SaleInvoice = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { show } = useToast();
  const { t, tf } = useLanguage();
  const [data, setData] = useState(null);

  useEffect(() => {
    salesApi.detail(id).then(setData).catch((e) => show(e.message, 'error'));
  }, [id]);

  if (!data) return <Spinner />;
  const { sale, items } = data;
  const receiptNo = String(sale.id).slice(0, 8).toUpperCase();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="btn-ghost !px-4 !py-2 text-sm">← {t.pos.invoice.back}</button>
        <button onClick={() => window.print()} className="btn-primary inline-flex items-center gap-2 !px-6 !py-2 text-sm"><Printer className="h-4 w-4" />{t.pos.invoice.print}</button>
      </div>

      <div className="invoice card p-8">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold text-slate-900">{SHOP.name}</h1>
          {SHOP.address && <p className="text-sm text-slate-500">{SHOP.address}</p>}
          {SHOP.phone && <p className="text-sm text-slate-500">{SHOP.phone}</p>}
          <p className="mt-3 inline-block rounded-full bg-slate-900 px-4 py-1 text-xs font-bold uppercase tracking-widest text-white">{t.pos.invoice.receipt}</p>
        </div>

        <div className="mt-6 flex justify-between border-y border-dashed border-slate-200 py-3 text-sm">
          <div>
            <p className="text-xs uppercase text-slate-400">{t.pos.invoice.receiptNo}</p>
            <p className="font-bold">{receiptNo}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase text-slate-400">{t.pos.invoice.date}</p>
            <p className="font-bold">{new Date(sale.created_at).toLocaleString()}</p>
          </div>
        </div>

        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-slate-400">
              <th className="py-2">{t.pos.invoice.item}</th>
              <th className="py-2 text-center">{t.pos.invoice.qty}</th>
              <th className="py-2 text-right">{t.pos.invoice.price}</th>
              <th className="py-2 text-right">{t.pos.invoice.total}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 font-semibold">{it.product_name}</td>
                <td className="py-2.5 text-center">{it.quantity}</td>
                <td className="py-2.5 text-right">{formatTZS(it.unit_price)}</td>
                <td className="py-2.5 text-right font-bold">{formatTZS(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-4 text-right font-display text-2xl font-bold">{t.pos.invoice.total}: {formatTZS(sale.total)}</p>

        <p className="mt-8 text-center text-sm text-slate-400">{t.pos.invoice.thanks}</p>
      </div>
    </div>
  );
};

export default SaleInvoice;
