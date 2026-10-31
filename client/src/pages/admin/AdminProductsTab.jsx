import { useState } from 'react';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Upload,
  X,
  Loader2,
  Image as ImageIcon,
  Check,
  Star,
  ExternalLink,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  getAdminProducts,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
  uploadAdminImage,
} from '../../services/admin';
import { useCategories } from '../../hooks/useCatalog';

const PRESET_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'OS'];

export function AdminProductsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [page, setPage] = useState(0);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formStock, setFormStock] = useState('10');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formFeatured, setFormFeatured] = useState(false);
  const [formSizes, setFormSizes] = useState([]);
  const [formImages, setFormImages] = useState([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const categoriesQuery = useCategories();
  const categories = categoriesQuery.data?.categories || [];

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-products', search, selectedCategory, page],
    queryFn: () =>
      getAdminProducts({
        search,
        categoryId: selectedCategory || undefined,
        page,
        size: 50,
      }),
  });

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      editingProduct
        ? updateAdminProduct(editingProduct.id, payload)
        : createAdminProduct(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['admin-summary'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      closeModal();
    },
    onError: (err) => {
      setFormError(err.message || 'Failed to save product details.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteAdminProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      queryClient.invalidateQueries({ queryKey: ['admin-summary'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeleteConfirmId(null);
    },
  });

  function openCreateModal() {
    setEditingProduct(null);
    setFormName('');
    setFormSlug('');
    setFormDescription('');
    setFormPrice('');
    setFormStock('10');
    setFormCategoryId(categories[0]?.id || '');
    setFormFeatured(false);
    setFormSizes(['S', 'M', 'L']);
    setFormImages([
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1200&q=80',
    ]);
    setFormError('');
    setIsModalOpen(true);
  }

  function openEditModal(prod) {
    setEditingProduct(prod);
    setFormName(prod.name);
    setFormSlug(prod.slug);
    setFormDescription(prod.description);
    setFormPrice(String(prod.price));
    setFormStock(String(prod.stock));
    setFormCategoryId(prod.category?.id || categories[0]?.id || '');
    setFormFeatured(Boolean(prod.featured));
    setFormSizes(prod.sizes || []);
    setFormImages(prod.images || []);
    setFormError('');
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingProduct(null);
    setFormError('');
  }

  function toggleSize(sz) {
    setFormSizes((prev) =>
      prev.includes(sz) ? prev.filter((s) => s !== sz) : [...prev, sz]
    );
  }

  function addImageUrl() {
    if (!newImageUrl.trim()) return;
    setFormImages((prev) => [...prev, newImageUrl.trim()]);
    setNewImageUrl('');
  }

  function removeImage(idx) {
    setFormImages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setFormError('');
      const res = await uploadAdminImage(file);
      if (res?.url) {
        setFormImages((prev) => [...prev, res.url]);
      }
    } catch (err) {
      setFormError(err.message || 'Image upload failed.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    setFormError('');

    if (!formName.trim()) {
      setFormError('Please enter a product name');
      return;
    }
    if (!formCategoryId) {
      setFormError('Please select a category');
      return;
    }
    if (isNaN(Number(formPrice)) || Number(formPrice) <= 0) {
      setFormError('Please enter a valid price greater than $0');
      return;
    }

    const payload = {
      name: formName.trim(),
      slug: formSlug.trim() || undefined,
      description: formDescription.trim(),
      price: Number(formPrice),
      stock: parseInt(formStock, 10) || 0,
      featured: formFeatured,
      categoryId: Number(formCategoryId),
      sizes: formSizes,
      images: formImages.length ? formImages : [
        'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1200&q=80',
      ],
    };

    saveMutation.mutate(payload);
  }

  const products = data?.content || [];

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-2xl border border-ink/10 shadow-sm">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search piece, description..."
              className="w-full rounded-full border border-ink/15 bg-white py-1.5 pl-9 pr-4 text-xs font-medium text-ink placeholder:text-ink/40 focus:border-accent outline-none"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-full border border-ink/15 bg-white py-1.5 px-4 text-xs font-semibold text-ink focus:border-accent outline-none"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={openCreateModal}
          className="button-primary flex items-center gap-2 text-xs py-2 px-5"
        >
          <Plus size={15} />
          <span>New Piece</span>
        </button>
      </div>

      {/* Products Table */}
      <div className="overflow-hidden rounded-2xl bg-white border border-ink/10 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-ink/10 text-[11px] font-bold uppercase tracking-wider text-ink/60">
              <tr>
                <th className="py-3.5 px-6">Piece</th>
                <th className="py-3.5 px-6">Category</th>
                <th className="py-3.5 px-6">Price</th>
                <th className="py-3.5 px-6">Stock Status</th>
                <th className="py-3.5 px-6">Sizes</th>
                <th className="py-3.5 px-6">Featured</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="py-4 px-6">
                      <div className="h-8 w-full rounded bg-stone-100" />
                    </td>
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-6 text-center text-ink/50">
                    No products found. Click "New Piece" to create one.
                  </td>
                </tr>
              ) : (
                products.map((prod) => (
                  <tr key={prod.id} className="hover:bg-stone-50/60 transition">
                    {/* Thumbnail & Title */}
                    <td className="py-3.5 px-6">
                      <div className="flex items-center gap-3">
                        <img
                          src={prod.images?.[0] || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=120&q=80'}
                          alt={prod.name}
                          className="size-11 rounded-lg object-cover bg-stone-100 shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-ink line-clamp-1">{prod.name}</span>
                            <Link
                              to={`/products/${prod.slug}`}
                              target="_blank"
                              className="text-ink/40 hover:text-accent transition"
                              title="View on storefront"
                            >
                              <ExternalLink size={12} />
                            </Link>
                          </div>
                          <span className="font-mono text-[10px] text-ink/50">{prod.slug}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-6">
                      <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-ink/80">
                        {prod.category?.name}
                      </span>
                    </td>

                    <td className="py-3.5 px-6 font-semibold text-ink">
                      ${Number(prod.price).toFixed(2)}
                    </td>

                    <td className="py-3.5 px-6">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          prod.stock === 0
                            ? 'bg-rose-100 text-rose-800'
                            : prod.stock <= 3
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {prod.stock === 0 ? 'Sold Out' : `${prod.stock} in stock`}
                      </span>
                    </td>

                    <td className="py-3.5 px-6 text-[11px] text-ink/70">
                      {prod.sizes?.length ? prod.sizes.join(', ') : 'None'}
                    </td>

                    <td className="py-3.5 px-6">
                      {prod.featured ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-accent">
                          <Star size={12} className="fill-accent" />
                          <span>Featured</span>
                        </span>
                      ) : (
                        <span className="text-ink/30 text-[11px]">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-6 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(prod)}
                          className="rounded-lg p-1.5 text-ink/60 hover:bg-stone-100 hover:text-ink transition"
                          title="Edit piece"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(prod.id)}
                          className="rounded-lg p-1.5 text-rose-600/70 hover:bg-rose-50 hover:text-rose-700 transition"
                          title="Delete piece"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-modal z-10 text-center animate-in fade-in zoom-in-95 duration-200">
            <h3 className="font-serif text-xl font-bold text-ink">Archive Piece?</h3>
            <p className="mt-2 text-xs text-ink/60">
              Are you sure you want to remove this piece from the catalog? This action cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="button-secondary flex-1 text-xs py-2"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirmId)}
                disabled={deleteMutation.isPending}
                className="rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white hover:bg-rose-700 transition flex-1 flex items-center justify-center gap-1.5"
              >
                {deleteMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative w-full max-w-2xl my-8 rounded-2xl bg-white p-6 sm:p-8 shadow-modal z-10 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <button
              onClick={closeModal}
              className="absolute right-4 top-4 rounded-full p-2 text-ink/40 hover:bg-stone-100 hover:text-ink transition"
            >
              <X size={18} />
            </button>

            <h2 className="font-serif text-2xl font-bold text-ink">
              {editingProduct ? 'Edit Piece' : 'Craft New Piece'}
            </h2>
            <p className="mt-0.5 text-xs text-ink/60">
              {editingProduct
                ? `Editing catalog entry #${editingProduct.id}`
                : 'Define specifications, stock, sizes, and architectural photography.'}
            </p>

            {formError && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              {/* Row 1: Name and Category */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink/75 mb-1.5">
                    Piece Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Boiled Wool Chore Jacket"
                    className="w-full rounded-xl border border-ink/15 px-3.5 py-2.5 text-xs font-medium text-ink focus:border-accent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink/75 mb-1.5">
                    Category *
                  </label>
                  <select
                    required
                    value={formCategoryId}
                    onChange={(e) => setFormCategoryId(e.target.value)}
                    className="w-full rounded-xl border border-ink/15 px-3.5 py-2.5 text-xs font-semibold text-ink focus:border-accent outline-none"
                  >
                    <option value="">Select a category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Price, Stock, Featured */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink/75 mb-1.5">
                    Price ($ USD) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="120.00"
                    className="w-full rounded-xl border border-ink/15 px-3.5 py-2.5 text-xs font-medium text-ink focus:border-accent outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink/75 mb-1.5">
                    Stock Quantity *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value)}
                    placeholder="10"
                    className="w-full rounded-xl border border-ink/15 px-3.5 py-2.5 text-xs font-medium text-ink focus:border-accent outline-none"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formFeatured}
                      onChange={(e) => setFormFeatured(e.target.checked)}
                      className="size-4 rounded border-ink/20 text-accent focus:ring-accent"
                    />
                    <span className="text-xs font-semibold text-ink">Feature on Homepage</span>
                  </label>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink/75 mb-1.5">
                  Description *
                </label>
                <textarea
                  rows={3}
                  required
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Material provenance, craftsmanship details, care instructions..."
                  className="w-full rounded-xl border border-ink/15 px-3.5 py-2.5 text-xs font-medium text-ink focus:border-accent outline-none leading-relaxed"
                />
              </div>

              {/* Available Sizes */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink/75 mb-1.5">
                  Available Sizes
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_SIZES.map((sz) => (
                    <button
                      type="button"
                      key={sz}
                      onClick={() => toggleSize(sz)}
                      className={`size-9 rounded-lg border text-xs font-semibold transition ${
                        formSizes.includes(sz)
                          ? 'border-ink bg-ink text-white'
                          : 'border-ink/20 bg-white text-ink hover:border-ink'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              {/* Images Section */}
              <div className="border-t border-ink/10 pt-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-ink/75 mb-1.5">
                  Product Photography
                </label>

                {/* File Upload / Cloudinary */}
                <div className="flex flex-col sm:flex-row gap-3 items-center">
                  <label className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl border border-dashed border-ink/30 px-4 py-2.5 text-xs font-semibold text-ink cursor-pointer hover:border-accent hover:text-accent transition">
                    {isUploading ? (
                      <Loader2 size={15} className="animate-spin text-accent" />
                    ) : (
                      <Upload size={15} />
                    )}
                    <span>{isUploading ? 'Uploading to Cloudinary...' : 'Upload Image'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploading}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  <div className="flex flex-1 gap-2 w-full">
                    <input
                      type="url"
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      placeholder="Or paste image URL (Unsplash, CDN...)"
                      className="flex-1 rounded-xl border border-ink/15 px-3.5 py-2 text-xs font-medium text-ink focus:border-accent outline-none"
                    />
                    <button
                      type="button"
                      onClick={addImageUrl}
                      className="button-secondary text-xs py-2 px-3 shrink-0"
                    >
                      Add URL
                    </button>
                  </div>
                </div>

                {/* Image Previews Grid */}
                {formImages.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {formImages.map((img, idx) => (
                      <div key={idx} className="group relative size-20 rounded-xl overflow-hidden border border-ink/10 bg-stone-100">
                        <img src={img} alt="" className="size-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute inset-0 bg-ink/60 text-white opacity-0 group-hover:opacity-100 grid place-items-center transition"
                          title="Remove image"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="pt-4 flex gap-3 border-t border-ink/10">
                <button
                  type="button"
                  onClick={closeModal}
                  className="button-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending || isUploading}
                  className="button-primary flex-1 flex items-center justify-center gap-2"
                >
                  {saveMutation.isPending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <span>{editingProduct ? 'Save Changes' : 'Create Piece'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
