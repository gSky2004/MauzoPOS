const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { pool } = require('./pool');
const { slugify } = require('../utils/helpers');

const uploadDir = path.resolve(__dirname, '../../', env.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });

// M&E PUB — drinks catalogue: [name, category, buy, pack, sell, stock, reorder, unit]
const products = [
  // Soft Drinks
  ['Coca-Cola 500ml', 'Soft Drinks', 18000, 24, 1000, 48, 24, 'bottle'],
  ['Fanta Orange 500ml', 'Soft Drinks', 18000, 24, 1000, 48, 24, 'bottle'],
  ['Sprite 500ml', 'Soft Drinks', 18000, 24, 1000, 48, 24, 'bottle'],
  ['Pepsi 500ml', 'Soft Drinks', 17000, 24, 1000, 24, 12, 'bottle'],
  ['Mirinda Orange 500ml', 'Soft Drinks', 17000, 24, 1000, 24, 12, 'bottle'],
  ['Mirinda Fruity 500ml', 'Soft Drinks', 17000, 24, 1000, 24, 12, 'bottle'],
  ['Mountain Dew 500ml', 'Soft Drinks', 18000, 24, 1000, 24, 12, 'bottle'],
  ['Coca-Cola 1.5L', 'Soft Drinks', 18000, 12, 2500, 24, 12, 'bottle'],
  ['Fanta Orange 1.5L', 'Soft Drinks', 18000, 12, 2500, 24, 12, 'bottle'],
  ['Sprite 1.5L', 'Soft Drinks', 18000, 12, 2500, 24, 12, 'bottle'],
  // Beers
  ['Safari Lager 500ml', 'Beers', 52000, 24, 3000, 48, 24, 'bottle'],
  ['Kilimanjaro Lager 500ml', 'Beers', 52000, 24, 3000, 48, 24, 'bottle'],
  ['Serengeti Lager 500ml', 'Beers', 54000, 24, 3000, 48, 24, 'bottle'],
  ['Castle Lite 500ml', 'Beers', 56000, 24, 3000, 48, 24, 'bottle'],
  ['Castle Lager 500ml', 'Beers', 52000, 24, 3000, 24, 12, 'bottle'],
  ['Serengeti Lite 330ml', 'Beers', 50000, 24, 2500, 24, 12, 'bottle'],
  ['Safari Lager 330ml', 'Beers', 48000, 24, 2500, 24, 12, 'bottle'],
  ['Kilimanjaro Lager 330ml', 'Beers', 48000, 24, 2500, 24, 12, 'bottle'],
  ['Kilimanjaro Lite 330ml', 'Beers', 52000, 24, 3000, 24, 12, 'bottle'],
  ['Serengeti Premium Lemon 500ml', 'Beers', 56000, 24, 3000, 24, 12, 'bottle'],
  ['Kilimanjaro Can 500ml', 'Beers', 58000, 24, 3500, 24, 12, 'can'],
  ['Safari Can 500ml', 'Beers', 58000, 24, 3500, 24, 12, 'can'],
  ['Castle Lite Can 500ml', 'Beers', 60000, 24, 3500, 24, 12, 'can'],
  // Water
  ['Kilimanjaro Water 500ml', 'Water', 7000, 24, 500, 72, 24, 'bottle'],
  ['Uhai Water 500ml', 'Water', 7000, 24, 500, 48, 24, 'bottle'],
  ['Afya Water 500ml', 'Water', 7000, 24, 500, 48, 24, 'bottle'],
  ['Kilimanjaro Water 1.5L', 'Water', 9000, 12, 1000, 24, 12, 'bottle'],
  ['Uhai Water 1.5L', 'Water', 9000, 12, 1000, 24, 12, 'bottle'],
  ['Afya Water 1.5L', 'Water', 9000, 12, 1000, 24, 12, 'bottle'],
  // Malt & Energy
  ['Red Bull 250ml', 'Malt & Energy', 42000, 24, 2500, 24, 12, 'can'],
  ['Power Horse 250ml', 'Malt & Energy', 30000, 24, 1500, 24, 12, 'can'],
  ['Sting Energy 330ml', 'Malt & Energy', 18000, 24, 1000, 48, 24, 'bottle'],
  ['Monster Energy 500ml', 'Malt & Energy', 50000, 24, 3000, 24, 12, 'can'],
  ['Bavaria Malt 330ml', 'Malt & Energy', 30000, 24, 2000, 24, 12, 'bottle'],
  ['Grand Malt 330ml', 'Malt & Energy', 28000, 24, 1500, 24, 12, 'bottle'],
  // Juices
  ['Azam Mango Juice 500ml', 'Juices', 18000, 24, 1500, 24, 12, 'bottle'],
  ['Azam Tropical Juice 500ml', 'Juices', 18000, 24, 1500, 24, 12, 'bottle'],
  ['Azam Orange Juice 500ml', 'Juices', 18000, 24, 1500, 24, 12, 'bottle'],
  ['Afya Mango Juice 500ml', 'Juices', 17000, 24, 1500, 24, 12, 'bottle'],
  ['Ceres Mango Juice 1L', 'Juices', 30000, 12, 3500, 12, 6, 'bottle'],
  ['Ceres Orange Juice 1L', 'Juices', 30000, 12, 3500, 12, 6, 'bottle'],
];

const categories = [
  { name: 'Beers', description: 'Lagers, lite, lemon and cans — served cold.' },
  { name: 'Juices', description: 'Azam, Afya and Ceres juices.' },
  { name: 'Water', description: 'Kilimanjaro, Uhai and Afya drinking water.' },
  { name: 'Malt & Energy', description: 'Malt drinks and energy boosts.' },
  { name: 'Soft Drinks', description: 'Coca-Cola, Fanta, Sprite, Pepsi, Mirinda and Mountain Dew.' },
];

const expenseCats = ['rent', 'electricity', 'salary', 'transport', 'maintenance', 'packaging', 'security', 'food'];

const seed = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const adminHash = await bcrypt.hash(env.adminPassword, 12);
    const { rows: admin } = await client.query(
      `INSERT INTO users (full_name, email, phone, password_hash, role)
       VALUES ($1,$2,$3,$4,'ADMIN')
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [env.adminName, env.adminEmail, env.adminPhone, adminHash]
    );

    const shopHash = await bcrypt.hash(process.env.SHOPKEEPER_PASSWORD || 'Shop@1234', 12);
    const { rows: shopRow } = await client.query(
      `INSERT INTO users (full_name, email, phone, password_hash, role, status)
       VALUES ('Shop Keeper', $1, '0712345679', $2, 'SHOPKEEPER', 'active')
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [process.env.SHOPKEEPER_EMAIL || 'shop@gsky.co.tz', shopHash]
    );

    console.log(admin[0] ? `[seed] Admin created: ${env.adminEmail}` : '[seed] Admin already exists');
    console.log(shopRow[0] ? '[seed] Shopkeeper created' : '[seed] Shopkeeper exists');

    // Clean slate: wipe transactional/test data (keeps users)
    await client.query(
      `TRUNCATE TABLE sales, sale_items, expenses, damaged_stock, daily_closings,
        stock_movements, stock_receipts, restock_requests, activity_log,
        shop_customers, suppliers CASCADE`
    );
    await client.query('DELETE FROM products');
    await client.query(
      `DELETE FROM categories WHERE name IN ('Football','Running','Basketball','Training','Lifestyle')`
    );

    const catIds = {};
    for (const c of categories) {
      const { rows } = await client.query(
        `INSERT INTO categories (name, description) VALUES ($1,$2)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
         RETURNING id, name`,
        [c.name, c.description]
      );
      catIds[c.name] = rows[0].id;
    }

    for (const [name, cat, buy, pack, sell, stock, reorder, unit] of products) {
      const slug = slugify(name);
      const { rows } = await client.query(
        `INSERT INTO products
           (category_id, name, slug, description, price, selling_price, buying_price,
            unit, bundle_qty, current_stock, reorder_level, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active')
         RETURNING id`,
        [catIds[cat], name, slug, `${name} ${unit}. Pack of ${pack}.`, sell, sell, buy, unit, pack, stock, reorder]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, type, qty_delta, resulting_stock, ref_type)
         VALUES ($1,'opening',$2,$3,'seed')`,
        [rows[0].id, stock, stock]
      );
    }

    for (const n of expenseCats) {
      await client.query('INSERT INTO expense_categories (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [n]);
    }

    await client.query('COMMIT');
    console.log(`[seed] M&E PUB ready: ${categories.length} categories, ${products.length} products.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

seed()
  .then(() => console.log('[seed] Done.'))
  .catch((err) => {
    console.error('[seed] Failed:', err.message);
    process.exit(1);
  });
