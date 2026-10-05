const { query, transaction } = require('../db/pool');
const { ApiError } = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { slugify, paginate } = require('../utils/helpers');

const productSelect = `
  SELECT p.*,
         c.name AS category_name,
         COALESCE(SUM(ps.stock_quantity), 0)::int AS total_stock,
         COALESCE(
           (SELECT ARRAY_AGG(pi.image_url) FROM product_images pi WHERE pi.product_id = p.id),
           ARRAY[]::text[]
         ) AS images,
         COALESCE(
           (SELECT json_agg(json_build_object('size', ps.size, 'stock_quantity', ps.stock_quantity) ORDER BY ps.size::int)
            FROM product_sizes ps WHERE ps.product_id = p.id),
           '[]'::json
         ) AS sizes
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN product_sizes ps ON ps.product_id = p.id
`;

const unitCostOf = (p) => {
  const buying = Number(p.buying_price || 0);
  const bundle = Number(p.bundle_qty || 1) || 1;
  return buying / bundle;
};

const withComputed = (p) => {
  const unitCost = unitCostOf(p);
  const selling = Number(p.selling_price ?? p.price ?? 0);
  return {
    ...p,
    selling_price: selling,
    unit_cost: unitCost,
    unit_profit: selling - unitCost,
  };
};

// Shopkeeper must never see buying/cost/profit, even via direct API call.
const sanitizeForRole = (p, role) => {
  if (role === 'ADMIN') return withComputed(p);
  const { buying_price, unit_cost, unit_profit, ...rest } = withComputed(p);
  return rest;
};

const groupProducts = (rows, role) => {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.id)) {
      map.set(
        r.id,
        sanitizeForRole(
          {
            id: r.id,
            name: r.name,
            slug: r.slug,
            description: r.description,
            price: r.price,
            selling_price: r.selling_price ?? r.price,
            buying_price: r.buying_price ?? 0,
            unit: r.unit || 'piece',
            bundle_qty: r.bundle_qty ?? 1,
            current_stock: r.current_stock ?? r.total_stock ?? 0,
            reorder_level: r.reorder_level ?? 0,
            expiry_date: r.expiry_date || null,
            supplier_id: r.supplier_id || null,
            status: r.status || 'active',
            main_image: r.main_image,
            is_featured: r.is_featured,
            is_new: r.is_new,
            is_best_seller: r.is_best_seller,
            category_id: r.category_id,
            category_name: r.category_name,
            created_at: r.created_at,
            updated_at: r.updated_at,
            images: r.images,
            sizes: r.sizes,
            total_stock: r.total_stock,
            avg_rating: r.avg_rating || null,
            review_count: r.review_count || 0,
          },
          role
        )
      );
    }
  }
  return Array.from(map.values());
};

const list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const { q, category, size, sort, featured, best_seller, is_new } = req.query;

  const where = ['1=1'];
  const params = [];
  const add = (clause, value) => {
    params.push(value);
    where.push(clause.replace('?', `$${params.length}`));
  };

  if (q) add('p.name ILIKE ?', `%${q}%`);
  if (category) add('p.category_id = ?', category);
  if (size) add(`EXISTS (SELECT 1 FROM product_sizes ps WHERE ps.product_id = p.id AND ps.size = ? AND ps.stock_quantity > 0)`, size);
  if (featured === 'true') add('p.is_featured = ?', true);
  if (best_seller === 'true') add('p.is_best_seller = ?', true);
  if (is_new === 'true') add('p.is_new = ?', true);

  const orderMap = {
    newest: 'p.created_at DESC',
    price_asc: 'p.price ASC',
    price_desc: 'p.price DESC',
    best_sellers: 'p.is_best_seller DESC, p.created_at DESC',
    name: 'p.name ASC',
  };
  const orderBy = orderMap[sort] || 'p.created_at DESC';

  const baseQuery = `${productSelect}
    LEFT JOIN (
      SELECT r.product_id, AVG(r.rating)::numeric(3,2) AS avg_rating, COUNT(*)::int AS review_count
      FROM reviews r GROUP BY r.product_id
    ) rv ON rv.product_id = p.id
    WHERE ${where.join(' AND ')} GROUP BY p.id, c.name, rv.avg_rating, rv.review_count`;

  const [{ rows: countRows }, { rows }] = await Promise.all([
    query(
      `SELECT COUNT(DISTINCT p.id)::int AS total FROM products p
       WHERE ${where.join(' AND ')}`,
      params
    ),
    query(`${baseQuery} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [
      ...params,
      limit,
      offset,
    ]),
  ]);

  const role = req.user?.role || null;
  res.json({
    products: groupProducts(rows, role),
    total: countRows[0].total,
    page,
    limit,
    totalPages: Math.ceil(countRows[0].total / limit),
  });
});

const getBySlug = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `${productSelect}
     LEFT JOIN (
       SELECT r.product_id, AVG(r.rating)::numeric(3,2) AS avg_rating, COUNT(*)::int AS review_count
       FROM reviews r GROUP BY r.product_id
     ) rv ON rv.product_id = p.id
     WHERE p.slug = $1 GROUP BY p.id, c.name, rv.avg_rating, rv.review_count`,
    [req.params.slug]
  );
  if (!rows[0]) throw new ApiError(404, 'Product not found');
  res.json({ product: groupProducts(rows, req.user?.role || null)[0] });
});

const getById = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `${productSelect}
     LEFT JOIN (
       SELECT r.product_id, AVG(r.rating)::numeric(3,2) AS avg_rating, COUNT(*)::int AS review_count
       FROM reviews r GROUP BY r.product_id
     ) rv ON rv.product_id = p.id
     WHERE p.id = $1 GROUP BY p.id, c.name, rv.avg_rating, rv.review_count`,
    [req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, 'Product not found');
  res.json({ product: groupProducts(rows, req.user?.role || null)[0] });
});

const parseBool = (v) => v === true || v === 'true';

// Multipart bodies hand back repeated keys as arrays and single keys as strings.
const toArray = (v) => {
  if (v === undefined || v === null || v === '') return [];
  if (Array.isArray(v)) return v.flatMap(toArray);
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t);
        return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
      } catch {
        return [v];
      }
    }
    return [v];
  }
  return [v];
};

const normalizeSizes = (sizes) => {
  if (!Array.isArray(sizes)) return [];
  return sizes
    .map((s) => {
      if (typeof s === 'string') {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      }
      return s;
    })
    .filter(Boolean);
};

const create = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    price,
    selling_price,
    buying_price,
    unit,
    bundle_qty,
    current_stock,
    reorder_level,
    expiry_date,
    supplier_id,
    status,
    category_id,
    sizes,
    is_featured,
    is_new,
    is_best_seller,
  } = req.body;

  const mainImage =
    (req.files && req.files[0] && `/uploads/${req.files[0].filename}`) ||
    req.body.main_image ||
    null;
  const gallery = req.files
    ? req.files.map((f) => `/uploads/${f.filename}`)
    : req.body.gallery || [];

  const slug = await uniqueSlug(name);
  const parsedSizes = normalizeSizes(
    typeof sizes === 'string' && sizes ? [sizes] : sizes
  );
  const sellPrice = selling_price ?? price ?? 0;
  const buyPrice = buying_price ?? 0;
  const bundle = Math.max(1, Number(bundle_qty) || 1);
  const openingStock = Math.max(0, Number(current_stock) || 0);

  const product = await transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO products (name, slug, description, price, selling_price, buying_price, unit, bundle_qty,
         current_stock, reorder_level, expiry_date, supplier_id, status,
         category_id, main_image, is_featured, is_new, is_best_seller)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        name,
        slug,
        description || '',
        sellPrice,
        sellPrice,
        buyPrice,
        (unit || 'piece').trim() || 'piece',
        bundle,
        openingStock,
        Math.max(0, Number(reorder_level) || 0),
        expiry_date || null,
        supplier_id || null,
        status || 'active',
        category_id || null,
        mainImage,
        parseBool(is_featured),
        parseBool(is_new),
        parseBool(is_best_seller),
      ]
    );

    if (openingStock > 0) {
      await client.query(
        `INSERT INTO stock_movements (product_id, type, qty_delta, resulting_stock, actor_id, ref_type)
         VALUES ($1,'opening',$2,$3,$4,'product.create')`,
        [rows[0].id, openingStock, openingStock, req.user.id]
      ).catch(() => {});
    }

    for (const img of gallery.filter(Boolean)) {
      await client.query('INSERT INTO product_images (product_id, image_url) VALUES ($1,$2)', [
        rows[0].id,
        img,
      ]);
    }

    if (parsedSizes.length) {
      for (const s of parsedSizes) {
        if (s.size && Number(s.stock_quantity) > 0) {
          await client.query(
            'INSERT INTO product_sizes (product_id, size, stock_quantity) VALUES ($1,$2,$3)',
            [rows[0].id, String(s.size), Number(s.stock_quantity)]
          );
        }
      }
    }
    return rows[0];
  });

  res.status(201).json({ product });
});

const uniqueSlug = async (name) => {
  const base = slugify(name) || 'product';
  let slug = base;
  let i = 1;
  for (;;) {
    const { rows } = await query('SELECT id FROM products WHERE slug = $1', [slug]);
    if (!rows[0]) return slug;
    slug = `${base}-${i++}`;
  }
};

const update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const existing = await query('SELECT * FROM products WHERE id = $1', [id]);
  if (!existing.rows[0]) throw new ApiError(404, 'Product not found');
  const prev = existing.rows[0];

  const {
    name,
    description,
    price,
    selling_price,
    buying_price,
    unit,
    bundle_qty,
    current_stock,
    reorder_level,
    expiry_date,
    supplier_id,
    status,
    category_id,
    sizes,
    remove_images,
    is_featured,
    is_new,
    is_best_seller,
  } = req.body;

  const newImages = req.files ? req.files.map((f) => `/uploads/${f.filename}`) : [];
  const parsedSizes = normalizeSizes(
    typeof sizes === 'string' && sizes ? [sizes] : sizes
  );
  const sellPrice = selling_price ?? price ?? prev.selling_price ?? prev.price ?? 0;

  const product = await transaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE products SET
         name = $1, description = $2, price = $3, selling_price = $4, buying_price = $5,
         unit = $6, bundle_qty = $7, current_stock = $8, reorder_level = $9,
         expiry_date = $10, supplier_id = $11, status = $12, category_id = $13,
         is_featured = $14, is_new = $15, is_best_seller = $16, updated_at = now()
       WHERE id = $17 RETURNING *`,
      [
        name ?? prev.name,
        description ?? prev.description,
        sellPrice,
        sellPrice,
        buying_price ?? prev.buying_price ?? 0,
        (unit ?? prev.unit ?? 'piece').toString().trim() || 'piece',
        Math.max(1, Number(bundle_qty ?? prev.bundle_qty) || 1),
        current_stock !== undefined ? Math.max(0, Number(current_stock) || 0) : (prev.current_stock ?? 0),
        reorder_level !== undefined ? Math.max(0, Number(reorder_level) || 0) : (prev.reorder_level ?? 0),
        expiry_date !== undefined ? (expiry_date || null) : (prev.expiry_date || null),
        supplier_id !== undefined ? (supplier_id || null) : (prev.supplier_id || null),
        status || prev.status || 'active',
        category_id !== undefined ? (category_id || null) : (prev.category_id || null),
        is_featured !== undefined ? parseBool(is_featured) : prev.is_featured,
        is_new !== undefined ? parseBool(is_new) : prev.is_new,
        is_best_seller !== undefined ? parseBool(is_best_seller) : prev.is_best_seller,
        id,
      ]
    );

    const delta = Number(rows[0].current_stock || 0) - Number(prev.current_stock || 0);
    if (delta !== 0) {
      await client.query(
        `INSERT INTO stock_movements (product_id, type, qty_delta, resulting_stock, actor_id, ref_type)
         VALUES ($1,'adjustment',$2,$3,$4,'product.update')`,
        [id, delta, rows[0].current_stock, req.user.id]
      ).catch(() => {});
    }

    if (newImages.length) {
      for (const url of newImages) {
        await client.query('INSERT INTO product_images (product_id, image_url) VALUES ($1,$2)', [
          id,
          url,
        ]);
      }
      if (!rows[0].main_image) {
        await client.query('UPDATE products SET main_image = $1 WHERE id = $2', [
          newImages[0],
          id,
        ]);
      }
    }

    // The edit form posts remove_images through FormData, so it arrives as a
    // single JSON string (or a repeated key). Array.isArray() alone silently
    // dropped every removal, leaving the "x" button on images a no-op.
    for (const url of toArray(remove_images)) {
      await client.query('DELETE FROM product_images WHERE product_id = $1 AND image_url = $2', [
        id,
        url,
      ]);
    }
    if (toArray(remove_images).length && !rows[0].main_image) {
      const { rows: left } = await client.query(
        'SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY id LIMIT 1',
        [id]
      );
      await client.query('UPDATE products SET main_image = $1 WHERE id = $2', [
        left[0] ? left[0].image_url : null,
        id,
      ]);
    }

    if (parsedSizes.length) {
      await client.query('DELETE FROM product_sizes WHERE product_id = $1', [id]);
      for (const s of parsedSizes) {
        if (s.size) {
          await client.query(
            `INSERT INTO product_sizes (product_id, size, stock_quantity)
             VALUES ($1,$2,$3)
             ON CONFLICT (product_id, size)
             DO UPDATE SET stock_quantity = EXCLUDED.stock_quantity`,
            [id, String(s.size), Number(s.stock_quantity) || 0]
          );
        }
      }
    }
    return rows[0];
  });

  res.json({ product });
});

const remove = asyncHandler(async (req, res) => {
  const { rows } = await query('DELETE FROM products WHERE id = $1 RETURNING id', [
    req.params.id,
  ]);
  if (!rows[0]) throw new ApiError(404, 'Product not found');
  res.json({ message: 'Product deleted' });
});

module.exports = { list, getBySlug, getById, create, update, remove };
