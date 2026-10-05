import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { HeaderControls } from '../components/ui/HeaderControls';

export const ShopkeeperLayout = () => {
  const { user, logout } = useAuth();
  const { t, tf } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Reuses AdminLayout shell (same sidebar/header/cards) with shopkeeper nav.
  const nav = [
    { to: '/shopkeeper', label: t.pos.nav.home, end: true },
    { to: '/shopkeeper/sale', label: t.pos.nav.recordSale },
    { to: '/shopkeeper/debt', label: t.pos.nav.debt },
    { to: '/shopkeeper/today', label: t.pos.nav.today },
    { to: '/shopkeeper/stock', label: t.pos.nav.stock },
    { to: '/shopkeeper/damage', label: t.pos.nav.reportDamage },
    { to: '/shopkeeper/expenses', label: t.pos.nav.expenses },
    { to: '/shopkeeper/closing', label: t.pos.nav.dailyClosing },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="hidden w-[203px] shrink-0 flex-col bg-slate-950 text-slate-300 md:flex">
        <div className="px-6 py-5">
          <img src="/logo.jpg" alt="MauzoPOS" className="h-10 w-auto rounded-lg" />
          <p className="mt-2 text-[11px] uppercase tracking-widest text-slate-500">{t.pos.header.shopkeeper}</p>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  isActive ? 'bg-green-600 text-white' : 'hover:bg-white/10'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1 border-t border-white/10 p-3">
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-red-400 hover:bg-white/10">
            {t.pos.header.logout}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button onClick={() => setOpen(true)} className="rounded-xl p-2 text-slate-700 hover:bg-slate-100 md:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <p className="flex items-center gap-2 font-display font-bold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-green-600 text-sm font-bold text-white">
              {(user?.full_name || 'S').trim().charAt(0).toUpperCase()}
            </span>
            {tf(t.pos.header.welcome, { name: user?.full_name?.split(' ')[0] || t.pos.header.shopkeeperFallback })}
          </p>
          </div>
          <div className="flex items-center gap-2">
            <HeaderControls />
            <button onClick={handleLogout} className="btn-ghost !px-3 !py-2 text-xs text-red-500 md:hidden">{t.pos.header.logout}</button>
          </div>
        </header>
        {/* Mobile drawer replaces the old always-visible link list */}
        <div className={`fixed inset-0 z-50 md:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
          <div
            onClick={() => setOpen(false)}
            className={`absolute inset-0 bg-slate-950/60 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
          />
          <aside className={`absolute inset-y-0 left-0 flex w-64 flex-col bg-slate-950 text-slate-300 shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="flex items-center justify-between px-6 py-5">
              <div>
                <img src="/logo.jpg" alt="MauzoPOS" className="h-10 w-auto rounded-lg" />
                <p className="mt-2 text-[11px] uppercase tracking-widest text-slate-500">{t.pos.header.shopkeeper}</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-white/10" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                      isActive ? 'bg-green-600 text-white' : 'hover:bg-white/10'
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <div className="space-y-1 border-t border-white/10 p-3">
              <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-red-400 hover:bg-white/10">
                {t.pos.header.logout}
              </button>
            </div>
          </aside>
        </div>
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
