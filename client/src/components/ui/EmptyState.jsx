import { Package } from 'lucide-react';

export const EmptyState = ({ icon = <Package className="h-12 w-12 text-slate-300" />, title, description, action }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
    <div className="mb-4">{icon}</div>
    <h3 className="font-display text-lg font-bold text-slate-800">{title}</h3>
    {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
    {action && <div className="mt-6">{action}</div>}
  </div>
);
