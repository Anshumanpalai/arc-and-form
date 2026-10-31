import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Price } from '../components/Price';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';

export function OrderHistoryPage() {
  const { user, openAuthModal } = useAuthStore();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchOrders() {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const data = await api('/api/orders?page=1&limit=20');
        setOrders(data?.content || []);
      } catch (err) {
        setError(err.message || 'Unable to load order history.');
      } finally {
        setLoading(false);
      }
    }

    fetchOrders();
  }, [user]);

  if (!user) {
    return (
      <main className="container-page py-20 text-center max-w-sm mx-auto">
        <h1 className="font-serif text-2xl font-normal text-charcoal">Sign In to View Orders</h1>
        <p className="mt-2 text-xs text-charcoal/60">
          Please sign in to view your past purchases and track current shipments.
        </p>
        <button
          onClick={() => openAuthModal('login')}
          className="button-primary mt-6 w-full text-xs"
        >
          Sign In
        </button>
      </main>
    );
  }

  return (
    <main className="container-page py-12 sm:py-16 max-w-3xl bg-[#FAF9F6]">
      <div className="border-b border-stone-200 pb-4 mb-8">
        <h1 className="font-serif text-2xl sm:text-3xl font-normal text-charcoal">Order History</h1>
        <p className="mt-1 text-xs text-charcoal/60">View your past orders and shipment status.</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 bg-stone-100 shimmer-mask border border-stone-200" />
          ))}
        </div>
      ) : error ? (
        <div className="border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          {error}
        </div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center border border-stone-200 bg-white p-8">
          <h2 className="font-serif text-xl font-normal text-charcoal">No orders yet</h2>
          <p className="mt-1 text-xs text-charcoal/60">You have not placed any orders yet.</p>
          <Link to="/" className="button-primary mt-6 inline-block text-xs">
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="border border-stone-200 bg-white p-5 sm:p-6 space-y-3"
            >
              <div className="flex justify-between items-baseline border-b border-stone-100 pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-xs text-charcoal">{order.orderNumber}</span>
                  <span className="text-xs text-charcoal/40">
                    {new Date(order.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <span className="text-[11px] font-medium uppercase px-2 py-0.5 bg-stone-100 text-charcoal">
                  {order.status}
                </span>
              </div>

              {order.items && (
                <ul className="text-xs space-y-1 text-charcoal/80">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between">
                      <span>
                        {item.productName} {item.selectedSize && `(${item.selectedSize})`} × {item.quantity}
                      </span>
                      <Price value={item.subtotal || item.unitPrice * item.quantity} />
                    </li>
                  ))}
                </ul>
              )}

              <div className="border-t border-stone-100 pt-2 flex justify-between items-center text-xs">
                <span className="text-charcoal/60">
                  {order.trackingNumber ? `Tracking: ${order.trackingNumber}` : 'Pending shipment'}
                </span>
                <div className="font-semibold text-charcoal">
                  <Price value={order.total} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
