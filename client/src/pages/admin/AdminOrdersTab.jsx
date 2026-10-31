import { useState } from 'react';
import { Search, Filter, Truck, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAdminOrders, updateAdminOrderStatus } from '../../services/admin';

const STATUS_FILTERS = ['ALL', 'PAID', 'SHIPPED', 'DELIVERED', 'PENDING', 'CANCELLED'];

export function AdminOrdersTab() {
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);

  // Modal state
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [nextStatus, setNextStatus] = useState('PAID');
  const [trackingNumber, setTrackingNumber] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-orders', selectedStatus, searchQuery, page],
    queryFn: () => getAdminOrders({ status: selectedStatus, query: searchQuery, page }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ orderId, status, trackingNumber }) =>
      updateAdminOrderStatus(orderId, { status, trackingNumber }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-summary'] });
      setSelectedOrder(null);
    },
  });

  function openUpdateModal(order) {
    setSelectedOrder(order);
    setNextStatus(order.status);
    setTrackingNumber(order.trackingNumber || '');
  }

  function handleSaveStatus(e) {
    e.preventDefault();
    if (!selectedOrder) return;
    updateMutation.mutate({
      orderId: selectedOrder.id,
      status: nextStatus,
      trackingNumber,
    });
  }

  const orders = data?.content || [];
  const totalPages = data?.totalPages || 0;

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-2xl border border-ink/10 shadow-sm">
        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((st) => (
            <button
              key={st}
              onClick={() => {
                setSelectedStatus(st);
                setPage(0);
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                selectedStatus === st
                  ? 'bg-ink text-white'
                  : 'bg-stone-100 text-ink/70 hover:bg-stone-200'
              }`}
            >
              {st === 'ALL' ? 'All Orders' : st}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:max-w-xs">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/40 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search order # or email..."
            className="w-full rounded-full border border-ink/15 bg-white py-1.5 pl-9 pr-4 text-xs font-medium text-ink placeholder:text-ink/40 focus:border-accent focus:ring-1 focus:ring-accent outline-none"
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-hidden rounded-2xl bg-white border border-ink/10 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 border-b border-ink/10 text-[11px] font-bold uppercase tracking-wider text-ink/60">
              <tr>
                <th className="py-3.5 px-6">Order</th>
                <th className="py-3.5 px-6">Customer & Recipient</th>
                <th className="py-3.5 px-6">Items</th>
                <th className="py-3.5 px-6">Total</th>
                <th className="py-3.5 px-6">Status</th>
                <th className="py-3.5 px-6">Tracking #</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="py-4 px-6">
                      <div className="h-6 w-full rounded bg-stone-100" />
                    </td>
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-6 text-center text-ink/50">
                    No orders matching your filters.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="hover:bg-stone-50/60 transition">
                    <td className="py-4 px-6">
                      <p className="font-mono font-semibold text-ink">{order.orderNumber}</p>
                      <p className="text-[11px] text-ink/50 mt-0.5">
                        {new Date(order.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </td>
                    <td className="py-4 px-6">
                      <p className="font-medium text-ink">{order.customerName}</p>
                      <p className="text-ink/50 mt-0.5">{order.customerEmail}</p>
                    </td>
                    <td className="py-4 px-6">
                      <span className="font-semibold text-ink">
                        {order.items?.length || 0} {order.items?.length === 1 ? 'item' : 'items'}
                      </span>
                      <p className="text-[11px] text-ink/50 truncate max-w-xs mt-0.5">
                        {order.items?.map((it) => `${it.quantity}x ${it.productName}`).join(', ')}
                      </p>
                    </td>
                    <td className="py-4 px-6 font-semibold text-ink">
                      ${Number(order.total).toFixed(2)}
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          order.status === 'PAID'
                            ? 'bg-emerald-50 text-emerald-700'
                            : order.status === 'SHIPPED'
                            ? 'bg-blue-50 text-blue-700'
                            : order.status === 'DELIVERED'
                            ? 'bg-stone-100 text-stone-700'
                            : order.status === 'CANCELLED'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 font-mono text-[11px] text-ink/70">
                      {order.trackingNumber ? (
                        <span className="bg-stone-100 px-2 py-0.5 rounded text-ink/80">
                          {order.trackingNumber}
                        </span>
                      ) : (
                        <span className="text-ink/30 italic">None</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => openUpdateModal(order)}
                        className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink hover:bg-stone-50 transition"
                      >
                        Update
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-ink/10 px-6 py-4">
            <button
              disabled={page <= 0}
              onClick={() => setPage((p) => p - 1)}
              className="button-secondary text-xs py-1.5 px-4 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-ink/60 font-medium">
              Page {page + 1} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="button-secondary text-xs py-1.5 px-4 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Update Order Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-ink/50 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedOrder(null)}
          />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 sm:p-8 shadow-modal z-10 animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedOrder(null)}
              className="absolute right-4 top-4 rounded-full p-2 text-ink/40 hover:bg-stone-100 hover:text-ink transition"
            >
              <X size={18} />
            </button>

            <h2 className="font-serif text-2xl font-bold text-ink">Update Order Fulfillment</h2>
            <p className="mt-1 text-xs text-ink/60">
              Order <span className="font-mono font-semibold text-ink">{selectedOrder.orderNumber}</span> • Customer: {selectedOrder.customerEmail}
            </p>

            {/* Items Summary */}
            <div className="my-5 rounded-xl bg-stone-50 p-4 border border-ink/10 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink/60">Items Ordered</p>
              {selectedOrder.items?.map((it, idx) => (
                <div key={idx} className="flex justify-between text-xs text-ink/80">
                  <span>
                    {it.quantity}x {it.productName} {it.selectedSize ? `(${it.selectedSize})` : ''}
                  </span>
                  <span className="font-semibold">${Number(it.unitPrice * it.quantity).toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t border-ink/10 pt-2 flex justify-between text-xs font-bold text-ink">
                <span>Total</span>
                <span>${Number(selectedOrder.total).toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handleSaveStatus} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink/75 mb-1.5">
                  Order Status
                </label>
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-xs font-semibold text-ink focus:border-accent outline-none"
                >
                  <option value="PAID">PAID (Payment Verified)</option>
                  <option value="SHIPPED">SHIPPED (En Route to Customer)</option>
                  <option value="DELIVERED">DELIVERED (Completed)</option>
                  <option value="PENDING">PENDING (Awaiting Payment)</option>
                  <option value="CANCELLED">CANCELLED (Refunded / Aborted)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink/75 mb-1.5">
                  Carrier Tracking Number
                </label>
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="e.g. FedEx 7890 1234 5678 or DHL Express"
                  className="w-full rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-xs font-medium text-ink focus:border-accent outline-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="button-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="button-primary flex-1 flex items-center justify-center gap-2"
                >
                  {updateMutation.isPending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    'Save Changes'
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
