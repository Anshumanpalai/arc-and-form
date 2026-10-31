import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Price } from '../components/Price';
import { useCartStore } from '../store/cartStore';
import { api } from '../services/api';

export function OrderSuccessPage() {
  const [searchParams] = useSearchParams();
  const orderNumberParam = searchParams.get('order_number');

  const [order, setOrder] = useState(null);

  useEffect(() => {
    useCartStore.getState().clearCart();

    async function loadOrder() {
      if (orderNumberParam) {
        try {
          const res = await api(`/api/orders/${orderNumberParam}`);
          if (res?.order) {
            setOrder(res.order);
          }
        } catch (err) {
          console.error('Failed to load order confirmation:', err);
        }
      }
    }

    loadOrder();
  }, [orderNumberParam]);

  return (
    <main className="container-page py-16 sm:py-24 max-w-xl text-center bg-[#FAF9F6]">
      <div className="mx-auto mb-5 grid size-12 place-items-center bg-charcoal text-white">
        <Check size={22} />
      </div>

      <h1 className="font-serif text-3xl font-normal text-charcoal">
        Thank You for Your Order
      </h1>
      <p className="mt-2 text-sm text-charcoal/70">
        Your payment has been received and your order is being prepared.
      </p>

      <div className="mt-10 border border-stone-200 bg-white p-6 sm:p-8 text-left space-y-5">
        <div className="flex justify-between items-baseline border-b border-stone-100 pb-4">
          <div>
            <p className="text-xs text-charcoal/60">Order Number</p>
            <p className="text-sm font-semibold text-charcoal mt-0.5">
              {order?.orderNumber || orderNumberParam || 'Processing...'}
            </p>
          </div>
          <span className="text-xs bg-stone-100 px-2.5 py-1 text-charcoal">
            {order?.status || 'Confirmed'}
          </span>
        </div>

        {order?.items && order.items.length > 0 && (
          <div className="border-b border-stone-100 pb-4">
            <p className="text-xs font-semibold text-charcoal mb-2">Items</p>
            <ul className="divide-y divide-stone-100 text-xs">
              {order.items.map((item) => (
                <li key={item.id} className="py-2 flex justify-between">
                  <span>
                    {item.productName} {item.selectedSize && `(${item.selectedSize})`} × {item.quantity}
                  </span>
                  <Price value={item.subtotal || item.unitPrice * item.quantity} className="font-medium" />
                </li>
              ))}
            </ul>
          </div>
        )}

        {order?.shippingAddress && (
          <div className="border-b border-stone-100 pb-4 text-xs text-charcoal/70 space-y-0.5">
            <p className="font-semibold text-charcoal mb-1">Shipping Address</p>
            <p>{order.shippingAddress.fullName}</p>
            <p>{order.shippingAddress.addressLine1}</p>
            <p>
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}
            </p>
          </div>
        )}

        <div className="flex justify-between items-center text-sm font-semibold text-charcoal">
          <span>Total</span>
          {order?.total ? <Price value={order.total} /> : <span>Authorized</span>}
        </div>
      </div>

      <div className="mt-8 flex justify-center gap-4">
        <Link to="/" className="button-primary text-xs py-3 px-6">
          Continue Shopping
        </Link>
        <Link to="/orders" className="button-secondary text-xs py-3 px-6">
          View Orders
        </Link>
      </div>
    </main>
  );
}
