import { useEffect, useState } from 'react';
import { FileText, MessageCircle, ChartColumn, TriangleAlert, Hourglass, Copy, Check, CalendarCheck } from 'lucide-react';
import { closingsApi, posApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner, ButtonSpinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatTZS } from '../../utils/helpers';

const stripLeadingEmoji = (s) => String(s || '').replace(/^(\p{Extended_Pictographic}|\uFE0F|\u200D|[\s·-]+)+/u, '').trim();

const ReportBlock = ({ icon: Icon, title, text }) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const [head, ...rest] = lines;
  const rows = [];
  rest.forEach((line) => {
    line.split('·').map((p) => p.trim()).filter(Boolean).forEach((part) => {
      const i = part.indexOf(':');
      if (i > 0) rows.push({ label: part.slice(0, i).trim(), value: part.slice(i + 1).trim() });
      else rows.push({ text: part });
    });
  });

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-green-50 text-green-700">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display font-bold text-slate-900">{title}</p>
            {head && <p className="text-xs text-slate-400">{stripLeadingEmoji(head)}</p>}
          </div>
        </div>
        <button onClick={copy} title={t.pos.reports.copyReport} className="btn-ghost shrink-0 !rounded-xl !px-2.5 !py-2">
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <div className="mt-4 divide-y divide-slate-100 rounded-xl bg-slate-50 px-4 py-1">
        {rows.length === 0 && <p className="py-3 text-sm text-slate-400">{t.pos.reports.noData}</p>}
        {rows.map((r, i) => (
          r.label ? (
            <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="font-semibold text-slate-500">{r.label}</span>
              <span className="text-right font-bold text-slate-900">{r.value}</span>
            </div>
          ) : (
            <p key={i} className="py-2 text-sm text-slate-600">{r.text}</p>
          )
        ))}
      </div>
    </div>
  );
};

const AdminReports = () => {
  const { show } = useToast();
  const { t, tf } = useLanguage();
  const [closings, setClosings] = useState(null);
  const [texts, setTexts] = useState({});
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStart = `${todayStr.slice(0, 7)}-01`;
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(todayStr);
  const [sections, setSections] = useState({ sales: true, credit: true, replenishment: true });
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    closingsApi.all().then((d) => setClosings(d.closings)).catch((e) => show(e.message, 'error'));
    ['daily', 'stock-alert', 'expiry-alert', 'summary'].forEach((n) =>
      posApi.report(n).then((d) => setTexts((t) => ({ ...t, [n]: d.text }))).catch(() => {})
    );
  }, []);

  const review = async (id) => {
    try { await closingsApi.review(id); show(t.pos.reports.reviewed); closingsApi.all().then((d) => setClosings(d.closings)); }
    catch (e) { show(e.message, 'error'); }
  };

  if (!closings) return <Spinner />;

  const toggleSection = (k) => setSections((s) => ({ ...s, [k]: !s[k] }));

  const downloadPdf = async () => {
    const picked = Object.entries(sections).filter(([, v]) => v).map(([k]) => k);
    if (!start || !end) return show(t.pos.reports.msgDates, 'error');
    if (end < start) return show(t.pos.reports.msgOrder, 'error');
    if (picked.length === 0) return show(t.pos.reports.msgSections, 'error');
    setDownloading(true);
    try {
      const blob = await posApi.rangePdf({ start, end, sections: picked.join(',') });
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `mauzopos-report-${start}_to_${end}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      show(t.pos.reports.msgDownloaded);
    } catch (e) { show(e.message, 'error'); } finally { setDownloading(false); }
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.reports.title}</h1>

      <div className="card space-y-4 p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-green-50 text-green-700">
            <FileText className="h-5 w-5" />
          </span>
          <p className="font-display font-bold text-slate-900">{t.pos.reports.pdfTitle}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div><label className="label">{t.pos.reports.start}</label><input className="input" type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} /></div>
          <div><label className="label">{t.pos.reports.end}</label><input className="input" type="date" value={end} min={start} max={todayStr} onChange={(e) => setEnd(e.target.value)} /></div>
          <div className="flex items-end gap-3 pb-1">
            {['sales', 'credit', 'replenishment'].map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={sections[k]} onChange={() => toggleSection(k)} className="h-4 w-4 accent-green-600" />
                {k === 'sales' ? t.pos.reports.secSales : k === 'credit' ? t.pos.reports.secDebt : t.pos.reports.secStock}
              </label>
            ))}
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <button onClick={downloadPdf} disabled={downloading} className="btn-primary w-full">
              {downloading ? <ButtonSpinner /> : t.pos.reports.download}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400">{t.pos.reports.hint}</p>
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-bold text-slate-900">{t.pos.reports.closings}</h2>
        {closings.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck className="h-12 w-12 text-slate-300" />}
            title={t.pos.reports.noClosings}
            description={t.pos.reports.noClosingsDesc}
          />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead><tr className="border-b text-xs uppercase text-slate-400"><th className="p-4">{t.pos.reports.thDate}</th><th className="p-4">{t.pos.reports.thShopkeeper}</th><th className="p-4">{t.pos.reports.thExpected}</th><th className="p-4">{t.pos.reports.thActual}</th><th className="p-4">{t.pos.reports.thDiff}</th><th className="p-4">{t.pos.reports.thReview}</th></tr></thead>
              <tbody>
                {closings.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="p-4 text-xs">{String(c.date).slice(0, 10)}</td>
                    <td className="p-4">{c.shopkeeper_name || '—'}</td>
                    <td className="p-4">{formatTZS(c.expected_cash)}</td>
                    <td className="p-4">{formatTZS(c.actual_cash)}</td>
                    <td className={`p-4 font-bold ${Number(c.difference) === 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatTZS(c.difference)}</td>
                    <td className="p-4">{c.reviewer_name ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><Check className="h-3.5 w-3.5" />{c.reviewer_name}</span> : <button onClick={() => review(c.id)} className="btn-ghost !px-3 !py-1 text-xs">{t.pos.reports.review}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportBlock icon={MessageCircle} title={t.pos.reports.blkDaily} text={texts.daily || '…'} />
        <ReportBlock icon={ChartColumn} title={t.pos.reports.blkSummary} text={texts.summary || '…'} />
        <ReportBlock icon={TriangleAlert} title={t.pos.reports.blkStock} text={texts['stock-alert'] || '…'} />
        <ReportBlock icon={Hourglass} title={t.pos.reports.blkExpiry} text={texts['expiry-alert'] || '…'} />
      </div>
    </div>
  );
};

export default AdminReports;
