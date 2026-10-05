import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ReceiptText, Boxes, ChartColumn } from 'lucide-react';
import { HeaderControls } from '../components/ui/HeaderControls';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ButtonSpinner } from '../components/ui/Spinner';
import { SEO } from '../components/SEO';
import { useLanguage } from '../context/LanguageContext';

const Login = () => {
  const { t, tf } = useLanguage();
  const { login } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const HIGHLIGHTS = [
    { icon: ReceiptText, title: t.pos.login.featSaleT, desc: t.pos.login.featSaleD },
    { icon: Boxes, title: t.pos.login.featStockT, desc: t.pos.login.featStockD },
    { icon: ChartColumn, title: t.pos.login.featRepT, desc: t.pos.login.featRepD },
  ];

  const from = location.state?.from?.pathname || '/';

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      show(tf(t.login.welcomeBack, { name: user.full_name }));
      if (user.role === 'ADMIN') navigate('/admin', { replace: true });
      else if (user.role === 'SHOPKEEPER') navigate('/shopkeeper', { replace: true });
      else navigate(from, { replace: true });
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SEO title={t.seo.login} />
      <div className="relative flex min-h-screen bg-white">
        <div className="absolute right-4 top-4 z-10">
          <HeaderControls />
        </div>
        <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-16 xl:px-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto w-full max-w-sm"
          >
            <div className="mx-auto w-fit rounded-2xl bg-slate-100 px-10 py-4">
              <img src="/logo.jpg" alt="MauzoPOS" className="h-12 w-auto object-contain" />
            </div>
            <h1 className="mt-6 text-center font-display text-2xl font-bold text-slate-900">{t.login.title}</h1>
            <p className="mt-1 text-center text-sm text-slate-500">{t.login.subtitle}</p>
            <form onSubmit={submit} className="mt-8 space-y-4">
              <div>
                <label className="label">{t.login.email}</label>
                <input className="input border-transparent bg-slate-100 focus:border-green-600 focus:bg-white" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" autoComplete="email" />
              </div>
              <div>
                <label className="label">{t.login.password}</label>
                <input className="input border-transparent bg-slate-100 focus:border-green-600 focus:bg-white" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" autoComplete="current-password" />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5">
                {loading ? <ButtonSpinner /> : t.login.login}
              </button>
            </form>
            <p className="mt-8 text-center text-xs text-slate-400">{t.pos.login.tagline}</p>
          </motion.div>
        </div>

        <div className="relative hidden overflow-hidden lg:flex lg:w-1/2 lg:flex-col lg:justify-center lg:px-16">
          <img src="/background-login.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-[40%_center]" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-green-950/45 via-transparent to-transparent" />
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="relative"
          >
            <div className="w-fit rounded-2xl bg-white px-6 py-3 shadow-2xl">
              <img src="/logo.jpg" alt="MauzoPOS" className="h-11 w-auto object-contain" />
            </div>
            <h2 className="mt-8 font-display text-3xl font-bold leading-tight text-white xl:text-4xl">
              {t.pos.login.hero}
            </h2>
            <p className="mt-3 max-w-md text-green-100">
              {t.pos.login.heroSub}
            </p>
            <div className="mt-10 space-y-5">
              {HIGHLIGHTS.map((h) => (
                <div key={h.title} className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-green-950/50 text-white">
                    <h.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-bold text-white">{h.title}</p>
                    <p className="text-sm text-green-100/80">{h.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default Login;
