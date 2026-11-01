import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock, Loader2, AlertCircle } from 'lucide-react';
import { Price } from '../components/Price';
import { ProductImage } from '../components/ProductImage';
import { cartSubtotal, useCartStore } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';

export function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const cancelled = searchParams.get('cancelled') === 'true';

  const { items } = useCartStore();
  const subtotal = cartSubtotal(items);
  const user = useAuthStore((state) => state.user);
  const openAuthModal = useAuthStore((state) => state.openAuthModal);

  const [formData, setFormData] = useState({
    fullName: user?.name || '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'United States',
  });

  // Keep full name in sync if user logs in after mounting
  useState(() => {
    if (user?.name && !formData.fullName) {
      setFormData((prev) => ({ ...prev, fullName: user.name }));
    }
  });

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (items.length === 0) {
      setError('Your shopping bag is empty.');
      return;
    }

    if (!user) {
      openAuthModal('login');
      setError('Please sign in or create an account to proceed with checkout.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          selectedSize: item.selectedSize,
        })),
        shippingAddress: {
          fullName: formData.fullName,
          addressLine1: formData.addressLine1,
          addressLine2: formData.addressLine2,
          city: formData.city,
          state: formData.state,
          postalCode: formData.postalCode,
          country: formData.country,
        },
      };

      const response = await api('/api/orders/checkout', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (response?.checkoutUrl) {
        window.location.href = response.checkoutUrl;
      } else {
        throw new Error('Checkout URL was not returned by the server.');
      }
    } catch (err) {
      if (err.status === 401) {
        openAuthModal('login');
        setError('Your session has expired. Please sign in again to complete checkout.');
      } else {
        setError(err.message || 'Unable to initiate checkout. Please verify your details.');
      }
      setIsSubmitting(false);
    }
  }

  if (items.length === 0 && !isSubmitting) {
    return (
      <main className="container-page py-20 text-center max-w-md mx-auto">
        <h1 className="font-serif text-3xl font-normal text-charcoal">Your bag is empty</h1>
        <p className="mt-3 text-sm text-charcoal/60">
          Add items from the collection to proceed with checkout.
        </p>
        <Link to="/" className="button-primary mt-6 inline-block text-xs">
          Explore Collection
        </Link>
      </main>
    );
  }

  return (
    <main className="container-page py-10 sm:py-14 bg-[#FAF9F6]">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-1.5 text-xs text-charcoal/60 hover:text-charcoal transition-colors"
      >
        <ArrowLeft size={14} />
        <span>Return to Shopping</span>
      </Link>

      {cancelled && (
        <div className="mb-8 border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>Payment was cancelled. Your bag items have been preserved.</span>
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
        {/* Shipping Form (7 cols) */}
        <section className="lg:col-span-7">
          <div className="border-b border-stone-200 pb-4">
            <h1 className="font-serif text-2xl sm:text-3xl font-normal text-charcoal">Shipping Address</h1>
            <p className="mt-1 text-xs text-charcoal/60">Please enter your delivery destination.</p>
          </div>

          {!user && (
            <div className="mt-4 border border-stone-200 bg-white p-3.5 text-xs text-charcoal/80 flex items-center justify-between">
              <span>Have an account? Sign in for seamless order tracking.</span>
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="font-semibold underline underline-offset-4 hover:text-charcoal"
              >
                Sign In
              </button>
            </div>
          )}

          {error && (
            <div role="alert" className="mt-4 border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-charcoal mb-1">
                Full Name *
              </label>
              <input
                type="text"
                name="fullName"
                required
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Jane Doe"
                className="w-full border border-stone-300 bg-white px-3.5 py-2.5 text-xs text-charcoal placeholder:text-muted outline-none focus:border-charcoal"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-charcoal mb-1">
                Address Line 1 *
              </label>
              <input
                type="text"
                name="addressLine1"
                required
                value={formData.addressLine1}
                onChange={handleChange}
                placeholder="Street address or P.O. Box"
                className="w-full border border-stone-300 bg-white px-3.5 py-2.5 text-xs text-charcoal placeholder:text-muted outline-none focus:border-charcoal"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-charcoal mb-1">
                Address Line 2 (Optional)
              </label>
              <input
                type="text"
                name="addressLine2"
                value={formData.addressLine2}
                onChange={handleChange}
                placeholder="Apartment, suite, unit, building, floor"
                className="w-full border border-stone-300 bg-white px-3.5 py-2.5 text-xs text-charcoal placeholder:text-muted outline-none focus:border-charcoal"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1">
                  City *
                </label>
                <input
                  type="text"
                  name="city"
                  required
                  value={formData.city}
                  onChange={handleChange}
                  placeholder="City"
                  className="w-full border border-stone-300 bg-white px-3.5 py-2.5 text-xs text-charcoal placeholder:text-muted outline-none focus:border-charcoal"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-charcoal mb-1">
                  State / Region *
                </label>
                <input
                  type="text"
                  name="state"
                  required
                  value={formData.state}
                  onChange={handleChange}
                  placeholder="State"
                  className="w-full border border-stone-300 bg-white px-3.5 py-2.5 text-xs text-charcoal placeholder:text-muted outline-none focus:border-charcoal"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1">
                  Postal Code *
                </label>
                <input
                  type="text"
                  name="postalCode"
                  required
                  value={formData.postalCode}
                  onChange={handleChange}
                  placeholder="ZIP or postal code"
                  className="w-full border border-stone-300 bg-white px-3.5 py-2.5 text-xs text-charcoal placeholder:text-muted outline-none focus:border-charcoal"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-charcoal mb-1">
                  Country *
                </label>
                <select
                  name="country"
                  value={formData.country}
                  onChange={handleChange}
                  className="w-full border border-stone-300 bg-white px-3.5 py-2.5 text-xs text-charcoal outline-none focus:border-charcoal cursor-pointer"
                >
                  <option value="United States">United States</option>
                  <option value="Canada">Canada</option>
                  <option value="United Kingdom">United Kingdom</option>
                  <option value="Germany">Germany</option>
                  <option value="Switzerland">Switzerland</option>
                  <option value="France">France</option>
                  <option value="Japan">Japan</option>
                  <option value="Australia">Australia</option>
                </select>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="button-primary w-full flex items-center justify-center gap-2 py-3.5 text-xs font-medium tracking-wider"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Redirecting to Payment...</span>
                  </>
                ) : (
                  <>
                    <Lock size={14} />
                    <span>Continue to Payment</span>
                  </>
                )}
              </button>
              <p className="mt-3 text-center text-xs text-charcoal/50">
                Secure checkout powered by Stripe. 256-bit SSL encryption.
              </p>
            </div>
          </form>
        </section>

        {/* Order Summary (5 cols) */}
        <section className="lg:col-span-5 h-fit border border-stone-200 bg-white p-6 space-y-5">
          <h2 className="font-serif text-lg font-normal text-charcoal border-b border-stone-200 pb-3">
            Order Summary ({items.length})
          </h2>

          <ul className="divide-y divide-stone-100 max-h-80 overflow-y-auto">
            {items.map((item) => (
              <li key={item.key} className="py-3 flex gap-3">
                <div className="w-14 aspect-[3/4] bg-stone-100 overflow-hidden shrink-0 border border-stone-200">
                  <ProductImage src={item.image} alt={item.name} className="size-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-charcoal line-clamp-1">{item.name}</p>
                  {item.selectedSize && (
                    <p className="text-[11px] text-charcoal/60 mt-0.5">Size: {item.selectedSize}</p>
                  )}
                  <p className="text-[11px] text-charcoal/60">Qty: {item.quantity}</p>
                </div>
                <Price value={Number(item.price) * item.quantity} className="text-xs font-medium text-charcoal shrink-0" />
              </li>
            ))}
          </ul>

          <div className="border-t border-stone-200 pt-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-charcoal/70">Subtotal</span>
              <Price value={subtotal} className="font-medium text-charcoal" />
            </div>
            <div className="flex justify-between">
              <span className="text-charcoal/70">Shipping</span>
              <span className="font-medium text-charcoal">Free</span>
            </div>
            <div className="border-t border-stone-200 pt-3 flex justify-between font-semibold text-sm text-charcoal">
              <span>Total</span>
              <Price value={subtotal} className="text-base" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
