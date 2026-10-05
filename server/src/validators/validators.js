const { body } = require('express-validator');

const productValidator = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('description').optional().trim(),
  body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('selling_price').optional().isFloat({ min: 0 }).withMessage('Selling price must be positive'),
  body('buying_price').optional().isFloat({ min: 0 }).withMessage('Buying price must be positive'),
  body('bundle_qty').optional().isInt({ min: 1 }).withMessage('Bundle quantity must be at least 1'),
  body('current_stock').optional().isInt({ min: 0 }).withMessage('Stock must be non-negative'),
  body('reorder_level').optional().isInt({ min: 0 }).withMessage('Reorder level must be non-negative'),
  body('unit').optional().trim(),
  body('expiry_date').optional({ nullable: true }).isISO8601().withMessage('Invalid expiry date'),
  body('supplier_id').optional({ nullable: true }).isUUID().withMessage('Invalid supplier'),
  body('sizes').optional().custom((value) => {
    if (value === undefined || value === null || value === '') return true;
    const list = Array.isArray(value) ? value : [value];
    for (const entry of list) {
      const parsed = typeof entry === 'string' ? JSON.parse(entry) : entry;
      if (!parsed || !parsed.size) throw new Error('Each size must include a size value');
      if (!Number.isInteger(Number(parsed.stock_quantity)) || Number(parsed.stock_quantity) < 0) {
        throw new Error('Stock must be a non-negative integer');
      }
    }
    return true;
  }),
];

const categoryValidator = [
  body('name').trim().notEmpty().withMessage('Category name is required'),
];

module.exports = {
  productValidator,
  categoryValidator,
};
