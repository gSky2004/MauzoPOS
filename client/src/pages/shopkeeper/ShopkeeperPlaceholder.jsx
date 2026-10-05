import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState';

const ShopkeeperPlaceholder = ({ title = 'Coming next', description = 'This module lands in the next build phase.' }) => (
  <div className="space-y-6">
    <h1 className="font-display text-2xl font-bold text-slate-900">{title}</h1>
    <div className="card p-6">
      <EmptyState icon="🚧" title={title} description={description} action={<Link to="/shopkeeper" className="btn-primary">Back home</Link>} />
    </div>
  </div>
);

export default ShopkeeperPlaceholder;
