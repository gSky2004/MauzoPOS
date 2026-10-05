import { useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

export const SEO = ({ title, description }) => {
  const { t } = useLanguage();
  useEffect(() => {
    document.title = title || t.error.defaultSeo;
    if (description) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', description);
    }
  }, [title, description, t]);
  return null;
};
