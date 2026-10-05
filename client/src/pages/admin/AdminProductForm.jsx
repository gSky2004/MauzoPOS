import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { productsApi, categoriesApi } from '../../services/gskyApi';
import { Spinner, ButtonSpinner } from '../../components/ui/Spinner';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { formatTZS } from '../../utils/helpers';

const SIZE_OPTIONS = [39, 40, 41, 42, 43, 44];

const AdminProductForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { show } = useToast();
  const { t, tf } = useLanguage();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const UNIT_OPTIONS = ['piece', 'bottle', 'packet', 'box', 'carton', 'bundle', 'kg', 'litre', 'other'];
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    selling_price: '',
    buying_price: '',
    unit: 'piece',
    bundle_qty: 1,
    current_stock: 0,
    reorder_level: 5,
    expiry_date: '',
    supplier_id: '',
    status: 'active',
    category_id: '',
    sizes: SIZE_OPTIONS.map((s) => ({ size: String(s), stock_quantity: 0 })),
  });
  const [files, setFiles] = useState([]);
  const [existingImages, setExistingImages] = useState([]);
  const [originalImages, setOriginalImages] = useState([]);

  useEffect(() => {
    categoriesApi.list().then((c) => {
      setCategories(c.categories);
      if (c.categories[0] && !isEdit) setForm((f) => ({ ...f, category_id: c.categories[0].id }));
    });

    if (isEdit) {
      productsApi.getById(id).then(({ product }) => {
        setForm({
          name: product.name,
          description: product.description,
          price: product.selling_price ?? product.price,
          selling_price: product.selling_price ?? product.price,
          buying_price: product.buying_price ?? '',
          unit: product.unit || 'piece',
          bundle_qty: product.bundle_qty ?? 1,
          current_stock: product.current_stock ?? 0,
          reorder_level: product.reorder_level ?? 5,
          expiry_date: product.expiry_date ? String(product.expiry_date).slice(0, 10) : '',
          supplier_id: product.supplier_id || '',
          status: product.status || 'active',
          category_id: product.category_id || '',
          sizes: SIZE_OPTIONS.map((s) => {
            const found = (product.sizes || []).find((x) => x.size === String(s));
            return { size: String(s), stock_quantity: found ? found.stock_quantity : 0 };
          }),
        });
        setExistingImages(product.images || []);
        setOriginalImages(product.images || []);
        setLoading(false);
      });
    }
  }, [id, isEdit]);

  const setSizeStock = (size, value) =>
    setForm((f) => ({
      ...f,
      sizes: f.sizes.map((s) => (s.size === size ? { ...s, stock_quantity: Number(value) } : s)),
    }));

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const unitCost = (Number(form.buying_price) || 0) / (Math.max(1, Number(form.bundle_qty) || 1));
  const unitProfit = (Number(form.selling_price || form.price) || 0) - unitCost;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = new FormData();
      data.append('name', form.name);
      data.append('description', form.description || '-');
      data.append('price', form.selling_price || form.price || 0);
      data.append('selling_price', form.selling_price || form.price || 0);
      data.append('buying_price', form.buying_price || 0);
      data.append('unit', form.unit);
      data.append('bundle_qty', form.bundle_qty);
      data.append('current_stock', form.current_stock);
      data.append('reorder_level', form.reorder_level);
      if (form.expiry_date) data.append('expiry_date', form.expiry_date);
      if (form.supplier_id) data.append('supplier_id', form.supplier_id);
      data.append('status', form.status);
      data.append('category_id', form.category_id);
      form.sizes.forEach((s) => data.append('sizes', JSON.stringify(s)));
      files.forEach((f) => data.append('images', f));
      if (isEdit) {
        // Send what the admin actually deleted. The "x" button only trimmed
        // local state, so without this the server kept every removed image.
        const removed = originalImages.filter((url) => !existingImages.includes(url));
        if (removed.length) data.append('remove_images', JSON.stringify(removed));
      }

      if (isEdit) {
        await productsApi.update(id, data);
        show(t.pos.productForm.msgUpdated);
      } else {
        await productsApi.create(data);
        show(t.pos.productForm.msgCreated);
      }
      navigate('/admin/products');
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  const totalStock = form.sizes.reduce((s, x) => s + x.stock_quantity, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin/products" className="text-sm font-semibold text-slate-500 hover:text-green-600">← {t.pos.productForm.products}</Link>
        <h1 className="font-display text-2xl font-bold text-slate-900">{isEdit ? t.pos.productForm.editTitle : t.pos.productForm.addTitle}</h1>
      </div>

      <form onSubmit={submit} className="card space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">{t.pos.productForm.name}</label>
            <input className="input" value={form.name} onChange={set('name')} required placeholder={t.pos.productForm.namePh} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">{t.pos.productForm.description}</label>
            <textarea className="input min-h-[120px]" value={form.description} onChange={set('description')} required placeholder={t.pos.productForm.descPh} />
          </div>
          <div>
            <label className="label">{t.pos.productForm.sellPrice}</label>
            <input className="input" type="number" min="0" step="100" value={form.selling_price || form.price} onChange={(e) => setForm({ ...form, selling_price: e.target.value, price: e.target.value })} required placeholder="1000" />
          </div>
          <div>
            <label className="label">{t.pos.productForm.buyPrice}</label>
            <input className="input" type="number" min="0" step="100" value={form.buying_price} onChange={set('buying_price')} placeholder="750" />
          </div>
          <div>
            <label className="label">{t.pos.productForm.unit}</label>
            <select className="input" value={form.unit} onChange={set('unit')}>
              {UNIT_OPTIONS.map((u) => (<option key={u} value={u}>{u}</option>))}
            </select>
          </div>
          <div>
            <label className="label">{t.pos.productForm.bundleQty}</label>
            <input className="input" type="number" min="1" step="1" value={form.bundle_qty} onChange={set('bundle_qty')} placeholder={t.pos.productForm.bundlePh} />
          </div>
          <div>
            <label className="label">{t.pos.productForm.curStock}</label>
            <input className="input" type="number" min="0" step="1" value={form.current_stock} onChange={set('current_stock')} />
          </div>
          <div>
            <label className="label">{t.pos.productForm.reorder}</label>
            <input className="input" type="number" min="0" step="1" value={form.reorder_level} onChange={set('reorder_level')} />
          </div>
          <div>
            <label className="label">{t.pos.productForm.expiry}</label>
            <input className="input" type="date" value={form.expiry_date} onChange={set('expiry_date')} />
          </div>
          <div>
            <label className="label">{t.pos.productForm.category}</label>
            <select className="input" value={form.category_id} onChange={set('category_id')}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          <p>{t.pos.productForm.unitCost}: <b>{formatTZS(unitCost)}</b> · {t.pos.productForm.unitProfit}: <b>{formatTZS(unitProfit)}</b></p>
          <p className="mt-1 text-xs text-slate-500">{t.pos.productForm.example}</p>
        </div>

        <div>
          <p className="label">{t.pos.productForm.sizesStock}</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {form.sizes.map((s) => (
              <div key={s.size} className="rounded-xl border border-slate-200 p-2 text-center">
                <p className="text-sm font-bold text-slate-700">{t.pos.productForm.size} {s.size}</p>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm"
                  type="number"
                  min="0"
                  value={s.stock_quantity}
                  onChange={(e) => setSizeStock(s.size, e.target.value)}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">{t.pos.productForm.totalStock}: {totalStock} {t.pos.productForm.pairs}</p>
        </div>

        <div>
          <p className="label">{t.pos.productForm.images}</p>
          <div className="flex flex-wrap gap-3">
            {existingImages.map((url, i) => (
              <div key={i} className="relative h-20 w-20">
                <img src={url} alt="" loading="lazy" decoding="async" className="h-20 w-20 rounded-xl object-cover" />
                <button type="button" onClick={() => setExistingImages(existingImages.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-red-500 text-xs text-white">✕</button>
              </div>
            ))}
            <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-slate-300 text-2xl text-slate-400 hover:border-green-600">
              ＋
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files)])} />
            </label>
          </div>
          {files.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">{tf(t.pos.productForm.newImages, { n: files.length })}</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Link to="/admin/products" className="btn-ghost">{t.pos.productForm.cancel}</Link>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <ButtonSpinner /> : isEdit ? t.pos.productForm.save : t.pos.productForm.create}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminProductForm;
