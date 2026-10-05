const fs = require('fs');
const sharp = require('sharp');

// Downscale phone photos at upload time (max 1024px wide) so product grids,
// invoices and evidence views stay fast on mobile data. Runs after multer,
// before validators/controllers. Never breaks the request: on any error the
// original file is kept as-is.
const resizeUpload = async (req, res, next) => {
  try {
    const files = [...(req.files || []), ...(req.file ? [req.file] : [])];
    for (const f of files) {
      if (!f || !f.path) continue;
      const tmp = `${f.path}.opt`;
      await sharp(f.path).resize({ width: 1024, withoutEnlargement: true }).toFile(tmp);
      fs.renameSync(tmp, f.path);
    }
    next();
  } catch (err) {
    console.error('[upload] resize skipped:', err.message);
    next();
  }
};

module.exports = resizeUpload;
