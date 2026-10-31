import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Price } from './Price';
import { ProductImage } from './ProductImage';
import { useCartStore } from '../store/cartStore';

export function ProductCard({ product }) {
  const [justAdded, setJustAdded] = useState(false);
  const addItem = useCartStore((state) => state.addItem);

  const images = Array.isArray(product.images)
    ? product.images.map((img) => (typeof img === 'string' ? img : img?.url))
    : [];

  const firstImage = images[0] || null;
  const secondImage = images[1] || null;

  const isOutOfStock = product.stock <= 0;
  const hasMultipleSizes = product.sizes && product.sizes.length > 1;

  function handleQuickAdd(e) {
    e.preventDefault();
    e.stopPropagation();

    if (isOutOfStock) return;

    if (hasMultipleSizes) {
      window.location.href = `/products/${product.slug}`;
      return;
    }

    const size = product.sizes?.[0] || null;
    addItem(product, 1, size);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1800);
  }

  return (
    <article className="group relative flex flex-col justify-between">
      <div>
        {/* Clean Image Container */}
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-stone-100 border border-stone-200/60">
          <Link to={`/products/${product.slug}`} className="block size-full" aria-label={`View ${product.name}`}>
            <ProductImage
              src={firstImage}
              alt={product.name}
              className={`size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 ${
                secondImage ? 'group-hover:opacity-0' : ''
              } ${isOutOfStock ? 'opacity-50 grayscale' : ''}`}
            />

            {secondImage && !isOutOfStock && (
              <ProductImage
                src={secondImage}
                alt={`${product.name} alternate view`}
                className="absolute inset-0 size-full object-cover opacity-0 transition-all duration-500 ease-out group-hover:opacity-100 group-hover:scale-105"
              />
            )}
          </Link>

          {/* Simple Sold Out Tag */}
          {isOutOfStock && (
            <div className="absolute top-3 left-3 bg-charcoal text-white text-[10px] font-medium uppercase tracking-wider px-2 py-0.5">
              Sold Out
            </div>
          )}

          {/* Clean Quick Add Action on Hover */}
          {!isOutOfStock && (
            <div className="absolute inset-x-3 bottom-3 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
              <button
                onClick={handleQuickAdd}
                className="w-full bg-charcoal text-white py-2.5 px-3 text-xs font-medium uppercase tracking-wider hover:bg-black transition-colors flex items-center justify-center gap-1.5"
              >
                {justAdded ? (
                  <>
                    <Check size={14} />
                    <span>Added</span>
                  </>
                ) : hasMultipleSizes ? (
                  <span>Select Size</span>
                ) : (
                  <span>+ Quick Add</span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Clean Information */}
        <div className="pt-3 space-y-1">
          <p className="text-[11px] text-muted uppercase tracking-wider">
            {product.category?.name || 'Apparel'}
          </p>

          <div className="flex items-baseline justify-between gap-2">
            <Link
              to={`/products/${product.slug}`}
              className="text-sm font-medium text-charcoal hover:underline underline-offset-4 line-clamp-1 transition-colors"
            >
              {product.name}
            </Link>
            <Price value={product.price} className="shrink-0 text-sm font-medium text-charcoal" />
          </div>
        </div>
      </div>
    </article>
  );
}
