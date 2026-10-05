const slugify = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const generateOrderNumber = () => {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate()
  ).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GSK-${ymd}-${rand}`;
};

const generateReference = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`.toUpperCase();

// Internal POS screens (stock picker, damage form, inventory table) ask for the
// whole catalogue with limit=200, so the ceiling has to allow it or they silently
// render a truncated list. 500 is still a bounded query.
const paginate = ({ page, limit }) => {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(500, Math.max(1, parseInt(limit, 10) || 12));
  return { page: p, limit: l, offset: (p - 1) * l };
};

module.exports = { slugify, generateOrderNumber, generateReference, paginate };
