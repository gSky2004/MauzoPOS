import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { productsApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatTZS, groupByPrice, packLabel } from '../../utils/helpers';

const ShopkeeperStock = () => {
  const { show } = useToast();
  const { t, tf, lang } = useLanguage();
  const [products, setProducts] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    productsApi.list({ limit: 200 }).then((d) => setProducts(d.products)).catch((e) => show(e.message, 'error'));
  }, []);

  if (!products) return <Spinner />;
  const filtered = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.stock.title}</h1>
      <div className="card p-4">
        <input className="input" placeholder={t.pos.stock.searchPh} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Package className="h-12 w-12 text-slate-300" />} title={t.pos.stock.noProducts} description={t.pos.stock.noMatch} />
      ) : (
        <div className="space-y-6">
          {groupByPrice(filtered, (p) => p.selling_price ?? p.price).map(([price, items]) => (
            <div key={price}>
              <div className="mb-3 flex items-center gap-3">
                <span className="rounded-full bg-slate-900 px-4 py-1.5 font-display text-sm font-bold text-white">{formatTZS(price)}</span>
                <span className="text-xs font-semibold text-slate-400">{items.length} item{items.length > 1 ? 's' : ''}</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((p) => {
                  const stock = Number(p.current_stock ?? 0);
                  const low = stock <= Number(p.reorder_level ?? 3);
                  return (
                    <div key={p.id} className="card flex flex-col overflow-hidden">
                      {p.main_image ? (
                        <img src={p.main_image} alt={p.name} className="h-32 w-full object-cover" />
                      ) : (
                        <div className="grid h-32 w-full place-items-center bg-slate-100"><Package className="h-10 w-10 text-slate-300" /></div>
                      )}
                      <div className="flex flex-1 flex-col gap-1 p-4">
                        <p className="text-sm font-bold text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-400">{packLabel(p, lang)}{p.category_name ? ` · ${p.category_name}` : ''}</p>
                        <p className={`mt-1 text-sm font-bold ${low ? 'text-red-600' : 'text-emerald-600'}`}>
                          {stock > 0 ? tf(t.pos.stock.available, { n: stock }) : t.pos.stock.outOfStock} · {tf(t.pos.home.left, { n: stock })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ShopkeeperStock;
