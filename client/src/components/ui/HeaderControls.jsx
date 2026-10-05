import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useLanguage } from '../../context/LanguageContext';

// Theme + language switches shown in app headers and on the login screen.
export const HeaderControls = () => {
  const { theme, toggle } = useTheme();
  const { lang, setLang, t } = useLanguage();

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex overflow-hidden rounded-xl bg-slate-100" role="group" aria-label="Language">
        {['en', 'sw'].map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            className={`px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide transition ${
              lang === l ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={toggle}
        title={theme === 'dark' ? t.pos.header.lightMode : t.pos.header.darkMode}
        className="rounded-xl bg-slate-100 p-2 text-slate-600 transition hover:text-slate-900"
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  );
};
