const DAY_MS = 86400000;

const clampInt = (v, fallback, min, max) => {
  const n = parseInt(v, 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

// Velocity-based replenishment snapshot shared by the inventory screen and the
// PDF report, so both always use the same suggestion math.
const getReplenishment = async (db, options = {}) => {
  const days = clampInt(options.days, 30, 7, 90);
  const safety = clampInt(options.safety, 7, 0, 30);
  const leadDefault = clampInt(options.leadDefault, 3, 0, 30);
  const now = options.now || Date.now();

  const { rows } = await db.query(
    `SELECT p.id, p.name, p.unit, p.bundle_qty, p.current_stock, p.reorder_level,
       p.expiry_date, p.supplier_id, s.name AS supplier_name,
       COALESCE(s.lead_time_days, $2)::int AS lead_days,
       COALESCE(SUM(CASE WHEN sa.created_at >= CURRENT_DATE - ($1 * INTERVAL '1 day') THEN si.quantity ELSE 0 END),0)::int AS units_sold
     FROM products p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN sale_items si ON si.product_id = p.id
     LEFT JOIN sales sa ON sa.id = si.sale_id
     WHERE p.status = 'active'
     GROUP BY p.id, s.name, s.lead_time_days
     ORDER BY p.name ASC`,
    [days, leadDefault]
  );

  const items = rows.map((p) => {
    const stock = Number(p.current_stock) || 0;
    const sold = Number(p.units_sold) || 0;
    const avg = sold / days;
    const pack = Math.max(1, Number(p.bundle_qty) || 1);
    const lead = Math.max(0, Number(p.lead_days) || 0);
    const expiry = p.expiry_date ? new Date(p.expiry_date) : null;
    const daysLeft = expiry ? Math.ceil((expiry.getTime() - now) / DAY_MS) : null;

    let status = 'OK';
    let suggested = 0;
    let reason = 'Stock cover is healthy.';
    let cover = null;

    if (stock <= 0) {
      status = 'OUT';
      const target = Math.ceil((lead + safety) * avg);
      suggested = avg > 0 ? Math.max(0, target) : 0;
      reason = avg > 0
        ? `Out of stock and sells ${avg.toFixed(1)}/day; suggest ${suggested} units.`
        : 'Out of stock with no recent sales; confirm demand before ordering.';
    } else if (sold <= 2) {
      status = 'SLOW';
      reason = `Only ${sold} sold in ${days} days with ${stock} left; do not reorder.`;
    } else {
      cover = avg > 0 ? stock / avg : null;
      const target = Math.ceil((lead + safety) * avg);
      suggested = Math.max(0, target - stock);
      if (cover !== null && cover > 60) {
        status = 'OVERSTOCK';
        suggested = 0;
        reason = `About ${cover.toFixed(0)} days of cover; sell through before reordering.`;
      } else if (suggested > 0) {
        status = 'LOW';
        reason = `Sells ${avg.toFixed(1)}/day; ${stock} left ≈ ${cover.toFixed(1)} days; lead ${lead}d + safety ${safety}d → target ${target}; suggest ${suggested} units.`;
      } else {
        reason = `Sells ${avg.toFixed(1)}/day; ${stock} left ≈ ${cover.toFixed(1)} days of cover.`;
      }
    }

    if (daysLeft !== null && stock > 0) {
      if (daysLeft < 0) {
        status = 'EXPIRY_RISK';
        suggested = 0;
        reason = 'Expired stock must be cleared or reported as damage; do not reorder.';
      } else if (avg > 0) {
        const sellable = Math.max(0, Math.floor(avg * Math.max(0, daysLeft - 3)));
        if (stock > sellable || suggested > Math.max(0, sellable - stock)) {
          const capped = Math.max(0, sellable - stock);
          if (suggested > capped) suggested = capped;
          status = 'EXPIRY_RISK';
          reason += ` Only about ${sellable} can sell before expiry in ${daysLeft}d.`;
        }
      } else if (daysLeft <= 30) {
        status = 'EXPIRY_RISK';
        reason += ` Expires in ${daysLeft}d with no recent sales.`;
      }
    }

    const packs = suggested > 0 ? Math.ceil(suggested / pack) : 0;
    return {
      product_id: p.id,
      name: p.name,
      unit: p.unit,
      bundle_qty: pack,
      current_stock: stock,
      reorder_level: Number(p.reorder_level) || 0,
      expiry_date: p.expiry_date,
      days_left: daysLeft,
      supplier_id: p.supplier_id,
      supplier_name: p.supplier_name,
      lead_days: lead,
      units_sold: sold,
      avg_daily: Number(avg.toFixed(2)),
      days_cover: cover === null ? null : Number(cover.toFixed(1)),
      target_stock: Math.ceil((lead + safety) * avg),
      suggested_units: suggested,
      suggested_packs: packs,
      status,
      reason,
    };
  });

  const needs = items.filter((i) => i.suggested_units > 0 || ['OUT', 'LOW', 'EXPIRY_RISK'].includes(i.status));
  return { days, safety, leadDefault, items, needs: needs.length };
};

module.exports = { getReplenishment };
