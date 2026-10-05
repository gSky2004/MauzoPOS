import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { useLanguage } from '../context/LanguageContext';

const NotFound = () => {
  const { t } = useLanguage();
  return (
  <>
    <SEO title={t.seo.notFound} />
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="font-display text-7xl font-bold text-green-600">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold text-slate-900">{t.notFound.title}</h1>
      <p className="mt-2 text-slate-500">{t.notFound.subtitle}</p>
      <Link to="/" className="btn-primary mt-6">{t.notFound.backHome}</Link>
    </div>
  </>
  );
};

export default NotFound;
