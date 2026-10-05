import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReceiptText, Package, Boxes, TriangleAlert, Wallet, Lock, Bell, Clock } from 'lucide-react';
import { inventoryApi, expensesApi, damageApi, restockApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';

const ShopkeeperHome = () => {
  const { show } = useToast();
  const { t, tf } = useLanguage();
  const [lowStock, setLowStock] = useState(null);
  const [pending, setPending] = useState(null);
  const [requestedIds, setRequestedIds] = useState([]);
  const tiles = [
    { to: '/shopkeeper/sale', label: t.pos.nav.recordSale, icon: ReceiptText, desc: t.pos.home.tileSaleD },
    { to: '/shopkeeper/today', label: t.pos.nav.today, icon: Package, desc: t.pos.home.tileTodayD },
    { to: '/shopkeeper/stock', label: t.pos.nav.stock, icon: Boxes, desc: t.pos.home.tileStockD },
    { to: '/shopkeeper/damage', label: t.pos.nav.reportDamage, icon: TriangleAlert, desc: t.pos.home.tileDamageD },
    { to: '/shopkeeper/expenses', label: t.pos.nav.expenses, icon: Wallet, desc: t.pos.home.tileExpensesD },
    { to: '/shopkeeper/closing', label: t.pos.nav.dailyClosing, icon: Lock, desc: t.pos.home.tileClosingD },
  ];

  const loadRequests = () => {
    restockApi.list().then((d) => setRequestedIds((d.requests || []).map((r) => r.product_id))).catch(() => setRequestedIds([]));
  };

  useEffect(() => {
    inventoryApi.alerts().then((d) => setLowStock(d.lowStock || [])).catch(() => setLowStock([]));
    loadRequests();
    Promise.all([
      expensesApi.list().catch(() => ({ expenses: [] })),
      damageApi.list().catch(() => ({ damages: [] })),
    ])
      .then(([e, d]) => setPending({
        expenses: (e.expenses || []).filter((x) => x.status === 'pending').length,
        damage: (d.damages || []).filter((x) => !x.reviewed).length,
      }))
      .catch(() => setPending({ expenses: 0, damage: 0 }));
  }, []);

  const requestRestock = async (productId) => {
    try {
      await restockApi.request(productId);
      show(t.pos.home.restockRequested);
      loadRequests();
    } catch (e) { show(e.message, 'error'); }
  };

  const pendingTotal = (pending?.expenses || 0) + (pending?.damage || 0);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.home.title}</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="card p-6 transition hover:shadow-lift">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-green-100 text-green-700"><t.icon className="h-6 w-6" /></span>
            <p className="mt-4 font-display font-bold text-slate-900">{t.label}</p>
            <p className="text-sm text-slate-500">{t.desc}</p>
          </Link>
        ))}
      </div>

      {lowStock && lowStock.length > 0 && (
        <div className="card border-l-4 border-l-red-500 p-5">
          <p className="flex items-center gap-2 font-display font-bold text-slate-900"><Bell className="h-5 w-5 text-red-500" />{t.pos.home.runningLow}</p>
          <div className="mt-2 space-y-2">
            {lowStock.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-600">{p.name} — <b>{tf(t.pos.home.left, { n: p.current_stock })}</b></span>
                {requestedIds.includes(p.id) ? (
                  <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">{t.pos.home.requested}</span>
                ) : (
                  <button onClick={() => requestRestock(p.id)} className="btn-primary shrink-0 !px-3 !py-1.5 text-xs">{t.pos.home.request}</button>
                )}
              </div>
            ))}
          </div>
          <Link to="/shopkeeper/stock" className="mt-3 inline-block text-sm font-bold text-green-600">{t.pos.home.viewAllStock}</Link>
        </div>
      )}

      {pendingTotal > 0 && (
        <div className="card border-l-4 border-l-amber-500 p-5">
          <p className="flex items-center gap-2 font-display font-bold text-slate-900"><Clock className="h-5 w-5 text-amber-500" />{t.pos.home.waitingApproval}</p>
          <p className="mt-1 text-sm text-slate-600">
            {pending.expenses > 0 && `${pending.expenses} ${pending.expenses > 1 ? t.pos.home.expenses : t.pos.home.expense1}`}
            {pending.expenses > 0 && pending.damage > 0 && ' · '}
            {pending.damage > 0 && `${pending.damage} ${pending.damage > 1 ? t.pos.home.damageReports : t.pos.home.damageReport1}`}
          </p>
        </div>
      )}
    </div>
  );
};

export default ShopkeeperHome;
