import { useEffect, useState } from 'react';
import { closingsApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner, ButtonSpinner } from '../../components/ui/Spinner';
import { formatTZS } from '../../utils/helpers';

const DailyClosing = () => {
  const { show } = useToast();
  const { t, tf } = useLanguage();
  const [expected, setExpected] = useState(null);
  const [actual, setActual] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    closingsApi.expected().then((d) => setExpected(d.expected_cash)).catch((e) => show(e.message, 'error'));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await closingsApi.submit({ actual_cash: Number(actual), note });
      show(t.pos.closing.msgSubmitted);
      setActual(''); setNote('');
    } catch (err) { show(err.message, 'error'); } finally { setSaving(false); }
  };

  if (expected === null) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.closing.title}</h1>
      <form onSubmit={submit} className="card space-y-3 p-5">
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-400">{t.pos.closing.expected}</p><p className="font-display text-xl font-bold text-slate-900">{formatTZS(expected)}</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-400">{t.pos.closing.counted}</p><p className="font-display text-xl font-bold text-slate-900">{actual === '' ? '—' : formatTZS(actual)}</p></div>
        </div>
        <div><label className="label">{t.pos.closing.cashLabel}</label><input className="input" type="number" min="0" required value={actual} onChange={(e) => setActual(e.target.value)} placeholder={t.pos.closing.cashPh} /></div>
        <div><label className="label">{t.pos.common.noteOpt}</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <button className="btn-primary w-full !py-4" disabled={saving}>{saving ? <ButtonSpinner /> : t.pos.closing.submit}</button>
      </form>
    </div>
  );
};

export default DailyClosing;
