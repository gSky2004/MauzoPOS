import { motion } from 'framer-motion';

const COLORS = ['#16a34a', '#0ea5e9', '#22c55e', '#a855f7', '#eab308', '#ef4444', '#14b8a6', '#64748b'];

export const DonutChart = ({ data, formatValue = (n) => String(n) }) => {
  if (!data.length) return <p className="py-8 text-center text-sm text-slate-400">No data yet</p>;

  const total = data.reduce((s, d) => s + Number(d.value), 0) || 1;
  const R = 80;
  const C = 2 * Math.PI * R;

  let offset = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <svg width="190" height="190" viewBox="0 0 200 200" className="shrink-0">
        <circle cx="100" cy="100" r={R} fill="none" stroke="#f1f5f9" strokeWidth="26" />
        {data.map((d, i) => {
          const frac = Number(d.value) / total;
          const dash = Math.max(frac * C - 2, 0.01);
          const color = COLORS[i % COLORS.length];
          const circle = (
            <motion.circle
              key={d.label}
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={color}
              strokeWidth="26"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 100 100)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.1 }}
            />
          );
          offset += frac * C;
          return circle;
        })}
        <text x="100" y="96" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 18, fontWeight: 700 }}>
          {data.length}
        </text>
        <text x="100" y="116" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 11 }}>
          categories
        </text>
      </svg>

      <ul className="space-y-2">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-slate-600">{d.label}</span>
            <span className="font-bold text-slate-900">{formatValue(d.value)}</span>
            <span className="text-xs text-slate-400">
              ({((Number(d.value) / total) * 100).toFixed(1)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
