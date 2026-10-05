import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
import { productsApi } from '../../services/gskyApi';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { formatTZS } from '../../utils/helpers';
import { Modal } from '../../components/ui/Modal';

const AdminProducts = () => {
  const { t, tf } = useLanguage();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState(null);
  const { show } = useToast();

  const load = () => {
    setLoading(true);
    productsApi
      .list({ limit: 100 })
      .then((d) => setProducts(d.products))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = q ? products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) : products;

  const handleDelete = async () => {
    try {
      await productsApi.remove(confirm.id);
      show(t.pos.products.msgDeleted);
      setConfirm(null);
      load();
    } catch (err) {
      show(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.products.title}</h1>
        <Link to="/admin/products/new" className="btn-primary">{t.pos.products.add}</Link>
      </div>

      <input className="input max-w-xs" placeholder={t.pos.products.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Package className="h-12 w-12 text-slate-300" />} title={t.pos.products.noProducts} description={t.pos.products.noProductsDesc} action={<Link to="/admin/products/new" className="btn-primary">{t.pos.products.add}</Link>} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t.pos.products.thProduct}</th>
                <th className="px-4 py-3">{t.pos.products.thCategory}</th>
                <th className="px-4 py-3">{t.pos.products.thBuying}</th>
                <th className="px-4 py-3">{t.pos.products.thSelling}</th>
                <th className="px-4 py-3">{t.pos.products.thStock}</th>
                <th className="px-4 py-3 text-right">{t.pos.products.thActions}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.main_image && <img src={p.main_image} alt="" loading="lazy" decoding="async" className="h-10 w-10 rounded-lg object-cover" />}
                      <span className="font-semibold text-slate-800">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{p.category_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{formatTZS(p.buying_price ?? 0)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{formatTZS(p.selling_price ?? p.price)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${p.total_stock > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                      {p.total_stock}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link to={`/admin/products/${p.id}`} className="btn-ghost !px-3 !py-1.5 text-xs">{t.pos.products.edit}</Link>
                      <button onClick={() => setConfirm(p)} className="btn-ghost !px-3 !py-1.5 text-xs text-red-500">{t.pos.products.delete}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={t.pos.products.delTitle}>
        <p className="text-sm text-slate-600">
          {tf(t.pos.products.delConfirm, { name: confirm?.name })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setConfirm(null)} className="btn-ghost">{t.pos.products.cancel}</button>
          <button onClick={handleDelete} className="btn bg-red-500 text-white hover:bg-red-600">{t.pos.products.delete}</button>
        </div>
      </Modal>
    </div>
  );
};

export default AdminProducts;
