import { motion } from 'framer-motion';

const PALETTE = ['#16a34a', '#0ea5e9', '#22c55e', '#a855f7', '#eab308', '#ef4444', '#14b8a6', '#64748b'];

export const BarChart = ({
  data,
  formatValue = (n) => String(n),
  color = '#16a34a',
  height = 180,
}) => {
  if (!data.length) return <p className="py-8 text-center text-sm text-slate-400">No data yet</p>;

  const max = Math.max(...data.map((d) => Number(d.value)), 1);
  const barArea = height - 32;

  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => {
        const value = Number(d.value);
        const h = Math.max((value / max) * barArea, 3);
        const label = String(d.label ?? '').length > 8 ? String(d.label ?? '').slice(0, 8) + '…' : d.label;
        return (
          <div key={d.label} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className="pointer-events-none whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
              {formatValue(value)}
            </span>
            <motion.div
              initial={{ height: 0 }}
              whileInView={{ height: h }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.06 }}
              className="w-full rounded-t-lg"
              style={{
                backgroundColor: Array.isArray(color) ? color[i % color.length] : color,
              }}
            />
            <span className="max-w-full truncate text-[10px] text-slate-500" title={String(d.label ?? '')}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export { PALETTE };
