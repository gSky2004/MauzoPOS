import { useEffect, useRef, useState } from 'react';
import { aiApi } from '../../services/gskyApi';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';

const AdminAssistant = () => {
  const { show } = useToast();
  const { t, tf } = useLanguage();
  const SUGGESTIONS = [t.pos.assistant.s1, t.pos.assistant.s2, t.pos.assistant.s3, t.pos.assistant.s4, t.pos.assistant.s5];
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [micLang, setMicLang] = useState('sw-TZ');
  const [micOk, setMicOk] = useState(true);
  const bottomRef = useRef(null);
  const recRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => () => {
    try { recRef.current?.abort?.(); } catch { /* noop */ }
  }, []);

  const send = async (text) => {
    const question = String(text || '').trim();
    if (!question || sending) return;
    setInput('');
    setMessages((m) => [...m, { from: 'you', text: question }]);
    setSending(true);
    try {
      const r = await aiApi.ask(question);
      setMessages((m) => [...m, { from: 'ai', text: r.answer }]);
    } catch (e) {
      show(e.message, 'error');
      setMessages((m) => [...m, { from: 'ai', text: t.pos.assistant.aiFail }]);
    } finally {
      setSending(false);
    }
  };

  const toggleMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setMicOk(false);
      show(t.pos.assistant.micUnsupported, 'error');
      return;
    }
    if (listening) {
      try { recRef.current?.stop(); } catch { /* noop */ }
      return;
    }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = micLang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const said = e.results?.[0]?.[0]?.transcript || '';
      if (said) setInput(said);
    };
    rec.onerror = () => {
      show(t.pos.assistant.micHear, 'error');
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      show(t.pos.assistant.micBusy, 'error');
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col space-y-4" style={{ minHeight: '70vh' }}>
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">{t.pos.assistant.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.pos.assistant.desc}</p>
      </div>

      {messages.length === 0 && (
        <div className="card space-y-2 p-4">
          <p className="text-sm font-bold text-slate-800">{t.pos.assistant.tryAsking}</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="rounded-xl bg-slate-100 px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-200">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card flex-1 space-y-3 p-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === 'you' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              m.from === 'you' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-800'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-green-600" />
              {t.pos.assistant.thinking}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {listening && <p className="text-center text-sm font-bold text-red-600">{t.pos.assistant.listening}</p>}

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="space-y-2">
        <input
          className="input w-full"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t.pos.assistant.placeholder}
          autoComplete="off"
        />
        <div className="flex gap-2">
          {micOk && (
            <button
              type="button"
              onClick={toggleMic}
              title={t.pos.assistant.micVoice}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold ${listening ? 'animate-pulse bg-red-600 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
{t.pos.assistant.mic}
            </button>
          )}
          {micOk && (
            <button
              type="button"
              onClick={() => setMicLang((l) => (l === 'sw-TZ' ? 'en-US' : 'sw-TZ'))}
              title={t.pos.assistant.micLang}
              className="shrink-0 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-600"
            >
              {micLangLabel[micLang]}
            </button>
          )}
          <button className="btn-primary flex-1 !py-2.5" disabled={sending}>{t.pos.assistant.send}</button>
        </div>
      </form>
    </div>
  );
};

export default AdminAssistant;
