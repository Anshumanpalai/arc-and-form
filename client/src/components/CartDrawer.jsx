import { Minus, Plus, ShoppingBag, Trash2, X, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Price } from './Price';
import { ProductImage } from './ProductImage';
import { cartSubtotal, cartTotalCount, useCartStore } from '../store/cartStore';

export function CartDrawer() {
  const { items, isOpen, closeCart, updateQuantity, removeItem } = useCartStore();
  const subtotal = cartSubtotal(items);
  const totalCount = cartTotalCount(items);

  const freeShippingThreshold = 150;
  const amountToFreeShipping = Math.max(0, freeShippingThreshold - subtotal);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 transition-opacity"
          onClick={closeCart}
          aria-label="Close cart backdrop"
        />
      )}

      {/* Slide-over Drawer */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white border-l border-stone-200 shadow-xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="Shopping bag"
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-5">
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-xl font-normal text-charcoal">Shopping Bag</h2>
            <span className="text-xs text-charcoal/60">({totalCount})</span>
          </div>
          <button
            onClick={closeCart}
            className="p-1 text-charcoal/60 hover:text-charcoal transition-colors"
            aria-label="Close cart"
          >
            <X size={18} />
          </button>
        </div>

        {/* Free Shipping Note */}
        <div className="border-b border-stone-100 bg-[#FAF9F6] px-6 py-3 text-xs text-charcoal/80">
          {amountToFreeShipping > 0 ? (
            <p>
              Add <Price value={amountToFreeShipping} className="font-semibold text-charcoal" /> more for free shipping.
            </p>
          ) : (
            <p className="font-medium text-charcoal">
              ✓ You qualify for free standard shipping.
            </p>
          )}
        </div>

        {/* Items List */}
        {items.length === 0 ? (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div className="space-y-4 max-w-xs">
              <div className="mx-auto grid size-12 place-items-center border border-stone-200 bg-stone-50 text-muted">
                <ShoppingBag size={20} />
              </div>
              <h3 className="font-serif text-lg font-normal text-charcoal">Your bag is empty</h3>
              <p className="text-xs text-charcoal/60 leading-relaxed">
                Browse our collection of modern essentials and find something you love.
              </p>
              <button
                onClick={closeCart}
                className="button-primary mt-2 text-xs"
              >
                Shop Collection
              </button>
            </div>
          </div>
        ) : (
          <>
            <ul className="flex-1 space-y-4 overflow-y-auto px-6 py-4 divide-y divide-stone-100">
              {items.map((item) => (
                <li key={item.key} className="pt-4 first:pt-0 flex gap-4 items-start">
                  <Link
                    to={`/products/${item.slug}`}
                    onClick={closeCart}
                    className="relative w-16 aspect-[3/4] shrink-0 overflow-hidden bg-stone-100 border border-stone-200 block"
                  >
                    <ProductImage
                      src={item.image}
                      alt={item.name}
                      className="size-full object-cover"
                    />
                  </Link>

                  <div className="min-w-0 flex-1 flex flex-col justify-between self-stretch">
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <Link
                          to={`/products/${item.slug}`}
                          onClick={closeCart}
                          className="font-medium text-xs text-charcoal hover:underline line-clamp-1"
                        >
                          {item.name}
                        </Link>
                        <button
                          onClick={() => removeItem(item.key)}
                          aria-label={`Remove ${item.name}`}
                          className="text-stone-400 hover:text-charcoal p-0.5 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {item.selectedSize && (
                        <p className="text-[11px] text-charcoal/60 mt-0.5">
                          Size: {item.selectedSize}
                        </p>
                      )}

                      <Price value={item.price} className="mt-1 block text-xs font-medium text-charcoal" />
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <div className="inline-flex items-center border border-stone-200 bg-white">
                        <button
                          onClick={() => updateQuantity(item.key, item.quantity - 1)}
                          className="p-1 text-stone-500 hover:text-charcoal"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={11} />
                        </button>
                        <span className="w-6 text-center text-xs font-medium text-charcoal">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.key, item.quantity + 1)}
                          disabled={item.quantity >= item.stock}
                          className="p-1 text-stone-500 hover:text-charcoal disabled:opacity-30"
                          aria-label="Increase quantity"
                        >
                          <Plus size={11} />
                        </button>
                      </div>

                      <span className="text-xs font-semibold text-charcoal">
                        <Price value={Number(item.price) * item.quantity} />
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Footer */}
            <div className="border-t border-stone-200 bg-white p-6 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-charcoal/70">Subtotal</span>
                <Price value={subtotal} className="font-semibold text-charcoal text-base" />
              </div>
              <p className="text-xs text-charcoal/50">
                Shipping and taxes calculated during checkout.
              </p>
              <Link
                to="/checkout"
                onClick={closeCart}
                className="button-primary w-full flex items-center justify-center gap-2 py-3.5 text-xs font-medium tracking-wider"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
