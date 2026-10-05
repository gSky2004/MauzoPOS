const PDFDocument = require('pdfkit');

const money = (n) => `TZS ${Number(n || 0).toLocaleString('en-US')}`;

// Footer lives in a reserved strip ABOVE the bottom margin. Writing below the
// margin (the old height - 30 with a 44pt margin) makes pdfkit open a brand-new
// page per footer, which is where every trailing blank page came from.
// Geometry proven by probe: bottom margin 30 + baseline at height - 48 adds
// zero pages.
const FOOTER_GAP = 10; // gap between content end and footer text
const FOOTER_Y_OFFSET = 48; // baseline measured from the page bottom edge
const contentBottom = (doc) => doc.page.height - FOOTER_Y_OFFSET - FOOTER_GAP;
const contentWidth = (doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;

// No column may end up narrower than this, otherwise wrapped words collapse
// into letter-by-letter vertical text.
const MIN_COL_W = 40;

const fitColumns = (doc, columns) => {
  const avail = contentWidth(doc);
  const total = columns.reduce((s, c) => s + c.width, 0);
  if (total <= avail) return columns.map((c) => ({ ...c, width: Math.max(MIN_COL_W, c.width) }));
  const scale = avail / total;
  const cols = columns.map((c) => ({ ...c, width: Math.max(MIN_COL_W, Math.floor(c.width * scale)) }));
  // Rounding can still overflow by a point or two; take it off the widest col.
  let over = cols.reduce((s, c) => s + c.width, 0) - avail;
  if (over > 0) {
    const widest = cols.reduce((a, b) => (a.width >= b.width ? a : b));
    widest.width = Math.max(MIN_COL_W, widest.width - over);
  }
  return cols;
};

const cellText = (r, key) => (r[key] === null || r[key] === undefined ? '—' : String(r[key]));

// Minimal table renderer: columns are scaled to the printable width, every
// row is exactly as tall as its tallest wrapped cell (so rows can never
// overprint each other), headers repeat, and a row that does not fit starts
// on the next page instead of splitting.
const table = (doc, columns, rows, opts = {}) => {
  const cols = fitColumns(doc, columns);
  const totalW = cols.reduce((s, c) => s + c.width, 0);
  const left = doc.page.margins.left;
  const bottom = contentBottom(doc);
  const pad = 3;
  const vPad = 3;

  const drawHead = () => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a');
    const h = Math.max(...cols.map((c) => doc.heightOfString(c.label, { width: c.width - pad * 2 })), 12) + vPad * 2;
    const y = doc.y;
    let x = left;
    cols.forEach((c) => {
      doc.text(c.label, x + pad, y + vPad, { width: c.width - pad * 2, align: c.align || 'left' });
      x += c.width;
    });
    doc.y = y + h;
    doc.strokeColor('#cbd5e1').lineWidth(1)
      .moveTo(left, doc.y)
      .lineTo(left + totalW, doc.y)
      .stroke();
    doc.moveDown(0.3);
  };

  drawHead();
  rows.forEach((r, i) => {
    doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
    const h = Math.max(...cols.map((c) => doc.heightOfString(cellText(r, c.key), { width: c.width - pad * 2 })), 12) + vPad * 2;
    if (doc.y + h > bottom) {
      doc.addPage();
      drawHead();
      doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
    }
    if (i % 2 === 1) {
      doc.save().fillColor('#f8fafc')
        .rect(left, doc.y, totalW, h)
        .fill().restore();
      doc.fillColor('#1e293b');
    }
    const y = doc.y;
    let x = left;
    cols.forEach((c) => {
      doc.text(cellText(r, c.key), x + pad, y + vPad, { width: c.width - pad * 2, align: c.align || 'left' });
      x += c.width;
    });
    doc.y = y + h;
  });
  // Tables leave the cursor at the end of their last cell. Any flowing text
  // drawn afterwards (titles, KPIs, notices) would start there and wrap into
  // a narrow sliver -- or, when the table ran past the page edge, render
  // letter-by-letter vertically. Reset to the left margin.
  doc.x = left;
  doc.moveDown(0.8);
};

const section = (doc, title) => {
  // Never strand a title at the very bottom: if not even the title plus a
  // couple of lines fit, start the section on a fresh page. Otherwise the
  // section simply continues the current page -- no page is created just
  // because a section starts.
  doc.x = doc.page.margins.left;
  if (doc.y > contentBottom(doc) - 46) doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text(title);
  doc.moveDown(0.4);
};

const kpis = (doc, pairs) => {
  // pairs: [[label, value], ...] rendered two per row
  doc.x = doc.page.margins.left;
  const estH = Math.ceil(pairs.length / 2) * 14 + 10;
  if (doc.y + estH > contentBottom(doc)) doc.addPage();
  doc.fontSize(10);
  for (let i = 0; i < pairs.length; i += 2) {
    const left = pairs[i];
    const right = pairs[i + 1];
    doc.font('Helvetica').fillColor('#64748b').text(left[0] + ': ', { continued: true })
      .font('Helvetica-Bold').fillColor('#0f172a').text(left[1]);
    if (right) {
      doc.font('Helvetica').fillColor('#64748b').text(right[0] + ': ', { continued: true })
        .font('Helvetica-Bold').fillColor('#0f172a').text(right[1]);
    }
  }
  doc.moveDown(0.6);
};

// Builds the full document. draw(ctx) receives helpers and renders content;
// footers with page numbers are stamped on every page afterwards.
const buildPdf = ({ title, subtitle, meta = [], draw }) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ margins: { top: 44, bottom: 30, left: 44, right: 44 }, size: 'A4', layout: 'landscape', bufferPages: true });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a').text(title);
  if (subtitle) doc.font('Helvetica').fontSize(11).fillColor('#475569').text(subtitle);
  doc.moveDown(0.4);
  meta.forEach((m) => doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(m));
  doc.moveDown(0.8);
  doc.strokeColor('#16a34a').lineWidth(2)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke();
  doc.moveDown(0.8);

  draw({ doc, table, section, kpis, money });

  const range = doc.bufferedPageRange();
  const left = doc.page.margins.left;
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
      .text(`Page ${i + 1} of ${range.count}`, left, doc.page.height - FOOTER_Y_OFFSET, {
        align: 'center', width: contentWidth(doc),
      });
  }
  doc.end();
});

module.exports = { buildPdf, money, table, section, kpis };
