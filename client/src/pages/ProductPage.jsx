import { useState } from 'react';
import { Minus, Plus, Check, ChevronDown } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Price } from '../components/Price';
import { ProductImage } from '../components/ProductImage';
import { ProductCard } from '../components/ProductCard';
import { useProduct, useProducts } from '../hooks/useCatalog';
import { useCartStore } from '../store/cartStore';

export function ProductPage() {
  const { slug } = useParams();
  const query = useProduct(slug);

  const [activeImage, setActiveImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [addedNotice, setAddedNotice] = useState(false);
  const [openSection, setOpenSection] = useState('details');

  const addItem = useCartStore((state) => state.addItem);

  const product = query.data?.product;
  const categorySlug = product?.category?.slug;

  const relatedQuery = useProducts(categorySlug ? { category: categorySlug } : {});

  if (query.isLoading) {
    return (
      <main className="container-page grid gap-12 py-16 md:grid-cols-2">
        <div className="aspect-[3/4] bg-stone-100 shimmer-mask" />
        <div className="space-y-6 pt-4">
          <div className="h-4 w-1/4 bg-stone-100 shimmer-mask" />
          <div className="h-10 w-3/4 bg-stone-100 shimmer-mask" />
          <div className="h-6 w-1/3 bg-stone-100 shimmer-mask" />
          <div className="h-24 w-full bg-stone-100 shimmer-mask" />
        </div>
      </main>
    );
  }

  if (query.isError || !product) {
    return (
      <main className="container-page py-24 text-center">
        <h1 className="font-serif text-3xl font-normal text-charcoal">Product Not Found</h1>
        <p className="mt-3 text-sm text-charcoal/60">
          {query.error?.message || 'The product you are looking for does not exist.'}
        </p>
        <Link to="/" className="button-secondary mt-8 inline-block text-xs">
          Return to Collection
        </Link>
      </main>
    );
  }

  const rawImages = product.images?.length ? product.images : [];
  const images = rawImages.map((img) => (typeof img === 'string' ? img : img?.url));
  const fallback = ['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1200&q=80'];
  const gallery = images.length ? images : fallback;
  const selectedImage = gallery[Math.min(activeImage, gallery.length - 1)];

  const sizes = product.sizes || [];
  const isOutOfStock = product.stock <= 0;

  const relatedPieces = (relatedQuery.data?.products || [])
    .filter((p) => p.id !== product.id && p.slug !== product.slug)
    .slice(0, 4);

  function handleAddToCart() {
    if (sizes.length > 0 && !selectedSize) {
      alert('Please select a size.');
      return;
    }

    addItem(product, quantity, selectedSize);
    setAddedNotice(true);
    setTimeout(() => setAddedNotice(false), 2000);
  }

  function toggleSection(section) {
    setOpenSection(openSection === section ? null : section);
  }

  return (
    <main className="container-page py-8 sm:py-12 bg-[#FAF9F6]">
      {/* Simple Breadcrumb */}
      <nav className="mb-8 flex items-center gap-2 text-xs text-charcoal/60">
        <Link to="/" className="hover:text-charcoal transition-colors">
          Home
        </Link>
        <span>/</span>
        <Link
          to={`/?category=${product.category?.slug}`}
          className="hover:text-charcoal transition-colors"
        >
          {product.category?.name || 'Shop'}
        </Link>
        <span>/</span>
        <span className="text-charcoal font-medium truncate">
          {product.name}
        </span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
        {/* Left Column: Image Gallery (7 cols) */}
        <section className="lg:col-span-7">
          <div className="space-y-4">
            {/* Primary Main Image */}
            <div className="relative aspect-[3/4] w-full overflow-hidden bg-stone-100 border border-stone-200">
              <ProductImage
                src={selectedImage}
                alt={product.name}
                className="size-full object-cover"
              />

              {isOutOfStock && (
                <div className="absolute inset-0 grid place-items-center bg-black/40">
                  <span className="bg-white px-5 py-2 text-xs font-semibold uppercase tracking-wider text-charcoal">
                    Sold Out
                  </span>
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {gallery.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {gallery.map((imgUrl, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImage(idx)}
                    className={`size-20 shrink-0 overflow-hidden border transition-all ${
                      idx === activeImage
                        ? 'border-charcoal ring-1 ring-charcoal'
                        : 'border-stone-200 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <ProductImage src={imgUrl} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Information & Actions (5 cols) */}
        <section className="lg:col-span-5 space-y-6">
          <div>
            <p className="text-xs text-muted uppercase tracking-wider">
              {product.category?.name}
            </p>
            <h1 className="mt-1 font-serif text-3xl sm:text-4xl font-normal text-charcoal tracking-tight">
              {product.name}
            </h1>
            <div className="mt-3">
              <Price value={product.price} className="text-2xl font-medium text-charcoal" />
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-charcoal/75 leading-relaxed font-light">
            {product.description}
          </p>

          {/* Sizing Selector */}
          {sizes.length > 0 && (
            <div className="border-t border-stone-200 pt-5 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-charcoal">Select Size</span>
                {selectedSize && (
                  <span className="text-muted">Selected: {selectedSize}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((sz) => (
                  <button
                    key={sz}
                    disabled={isOutOfStock}
                    onClick={() => setSelectedSize(sz)}
                    className={`min-w-12 border py-2.5 px-3.5 text-xs font-medium uppercase transition-colors ${
                      selectedSize === sz
                        ? 'border-charcoal bg-charcoal text-white'
                        : 'border-stone-300 bg-white text-charcoal hover:border-charcoal'
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity & Add to Bag */}
          {!isOutOfStock ? (
            <div className="border-t border-stone-200 pt-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center border border-stone-300 bg-white">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="p-3 text-muted hover:text-charcoal transition-colors"
                    aria-label="Decrease quantity"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="w-8 text-center text-xs font-semibold text-charcoal">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                    disabled={quantity >= product.stock}
                    className="p-3 text-muted hover:text-charcoal disabled:opacity-30 transition-colors"
                    aria-label="Increase quantity"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                <button
                  onClick={handleAddToCart}
                  className="button-primary flex-1 py-3.5 text-xs font-medium tracking-wider"
                >
                  {addedNotice ? (
                    <span className="flex items-center justify-center gap-2">
                      <Check size={16} />
                      <span>Added to Bag</span>
                    </span>
                  ) : (
                    <span>Add to Bag</span>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="border-t border-stone-200 pt-5">
              <button
                disabled
                className="w-full bg-stone-200 text-charcoal/50 py-3.5 text-xs font-medium uppercase tracking-wider cursor-not-allowed"
              >
                Currently Out of Stock
              </button>
            </div>
          )}

          {/* Simple Accordion Details */}
          <div className="border-t border-stone-200 divide-y divide-stone-200 text-xs">
            <div className="py-3.5">
              <button
                onClick={() => toggleSection('details')}
                className="flex w-full items-center justify-between text-left font-medium text-charcoal hover:opacity-80"
              >
                <span>Product Details &amp; Materials</span>
                <ChevronDown
                  size={15}
                  className={`transition-transform duration-200 ${
                    openSection === 'details' ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {openSection === 'details' && (
                <div className="mt-2.5 text-charcoal/70 leading-relaxed font-light space-y-1">
                  <p>Crafted from 100% natural fibers sourced from generational partner mills.</p>
                  <p>Regular fit. True to size.</p>
                  <p>Dry clean or cold wash gently. Line dry.</p>
                </div>
              )}
            </div>

            <div className="py-3.5">
              <button
                onClick={() => toggleSection('shipping')}
                className="flex w-full items-center justify-between text-left font-medium text-charcoal hover:opacity-80"
              >
                <span>Shipping &amp; Returns</span>
                <ChevronDown
                  size={15}
                  className={`transition-transform duration-200 ${
                    openSection === 'shipping' ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {openSection === 'shipping' && (
                <div className="mt-2.5 text-charcoal/70 leading-relaxed font-light space-y-1">
                  <p>Complimentary standard shipping on all orders over $150.</p>
                  <p>Delivered in 2-4 business days.</p>
                  <p>Effortless 30-day return window with prepaid return labels.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Related Products */}
      {relatedPieces.length > 0 && (
        <section className="mt-20 border-t border-stone-200 pt-14">
          <h2 className="font-serif text-2xl font-normal text-charcoal mb-8">
            You May Also Like
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
            {relatedPieces.map((related) => (
              <ProductCard key={related.id || related._id} product={related} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
