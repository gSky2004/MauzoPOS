const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const env = require('../config/env');

const SRC = path.resolve('C:/Users/HomePC/Desktop/gskyShoes');
const OUT = path.resolve(__dirname, '../../', env.uploadDir);

fs.mkdirSync(OUT, { recursive: true });

const run = async () => {
  const files = fs.readdirSync(SRC).filter((f) => /\.(jpe?g|png)$/i.test(f));
  console.log(`[images] Found ${files.length} source images`);

  const results = [];
  for (const file of files) {
    const base = path.basename(file, path.extname(file));
    const name = `${base}.webp`;
    try {
      await sharp(path.join(SRC, file))
        .resize(900, 900, { fit: 'cover', position: 'attention' })
        .webp({ quality: 78 })
        .toFile(path.join(OUT, name));
      results.push({ source: file, output: name, size: fs.statSync(path.join(OUT, name)).size });
    } catch (err) {
      console.error(`[images] Failed ${file}: ${err.message}`);
    }
  }

  for (const r of results) {
    const kb = Math.round(r.size / 1024);
    console.log(`[images] ${r.source} -> ${r.output} (${kb} KB)`);
  }
  console.log(`[images] Done. ${results.length}/${files.length} converted to WebP.`);
};

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
