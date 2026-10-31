import { DollarSign, Package, AlertTriangle, Truck, ArrowRight, RefreshCw } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAdminSummary, updateAdminProduct } from '../../services/admin';

export function AdminOverviewTab({ onNavigateTab }) {
  const queryClient = useQueryClient();
  const { data: summary, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-summary'],
    queryFn: getAdminSummary,
  });

  const restockMutation = useMutation({
    mutationFn: ({ product, addQty }) =>
      updateAdminProduct(product.id, {
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: product.price,
        stock: product.stock + addQty,
        featured: product.featured,
        categoryId: product.category?.id,
        sizes: product.sizes,
        images: product.images,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-summary'] });
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-2xl bg-white border border-ink/10 p-6" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
        <p className="font-semibold">Failed to load studio metrics</p>
        <button onClick={() => refetch()} className="button-secondary mt-4 text-xs">
          Retry
        </button>
      </div>
    );
  }

  const kpis = [
    {
      label: 'Gross Revenue',
      value: `$${Number(summary?.totalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      description: 'Paid & fulfilled orders',
      icon: DollarSign,
      color: 'text-emerald-700 bg-emerald-50',
    },
    {
      label: 'Total Orders',
      value: summary?.totalOrders || 0,
      description: 'Lifetime purchases',
      icon: Package,
      color: 'text-indigo-700 bg-indigo-50',
    },
    {
      label: 'Pending Shipments',
      value: summary?.pendingShipments || 0,
      description: 'Awaiting fulfillment',
      icon: Truck,
      color: 'text-amber-700 bg-amber-50',
    },
    {
      label: 'Low Stock Alerts',
      value: summary?.lowStockAlerts || 0,
      description: 'Items with ≤ 3 units',
      icon: AlertTriangle,
      color: 'text-rose-700 bg-rose-50',
    },
  ];

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className="rounded-2xl bg-white p-6 shadow-sm border border-ink/10 transition hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-ink/50">
                  {kpi.label}
                </span>
                <span className={`p-2.5 rounded-xl ${kpi.color}`}>
                  <Icon size={18} />
                </span>
              </div>
              <div className="mt-4">
                <span className="font-serif text-3xl font-bold tracking-tight text-ink">
                  {kpi.value}
                </span>
                <p className="mt-1 text-xs text-ink/50">{kpi.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Two Column Section */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Recent Orders */}
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-ink/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-ink/10 pb-4">
              <div>
                <h2 className="font-serif text-xl font-bold text-ink">Recent Orders</h2>
                <p className="text-xs text-ink/50 mt-0.5">Latest customer transactions</p>
              </div>
              <button
                onClick={() => onNavigateTab('orders')}
                className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-accent hover:text-accent-hover transition"
              >
                <span>View all</span>
                <ArrowRight size={13} />
              </button>
            </div>

            <div className="mt-4 divide-y divide-ink/5">
              {summary?.recentOrders?.length === 0 ? (
                <div className="py-12 text-center text-xs text-ink/50">
                  No orders recorded yet. Completed checkout sessions will appear here.
                </div>
              ) : (
                summary?.recentOrders?.map((order) => (
                  <div key={order.id} className="py-3.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-mono font-semibold text-ink">{order.orderNumber}</p>
                      <p className="text-ink/60 mt-0.5">{order.customerEmail || 'Guest'}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-ink">
                        ${Number(order.total).toFixed(2)}
                      </span>
                      <div className="mt-1">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            order.status === 'PAID'
                              ? 'bg-emerald-50 text-emerald-700'
                              : order.status === 'SHIPPED'
                              ? 'bg-blue-50 text-blue-700'
                              : order.status === 'DELIVERED'
                              ? 'bg-stone-100 text-stone-700'
                              : order.status === 'CANCELLED'
                              ? 'bg-red-50 text-red-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Low Stock Watchlist */}
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-ink/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-ink/10 pb-4">
              <div>
                <h2 className="font-serif text-xl font-bold text-ink">Inventory Alerts</h2>
                <p className="text-xs text-ink/50 mt-0.5">Pieces with critical stock levels</p>
              </div>
              <button
                onClick={() => onNavigateTab('products')}
                className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-accent hover:text-accent-hover transition"
              >
                <span>Manage stock</span>
                <ArrowRight size={13} />
              </button>
            </div>

            <div className="mt-4 divide-y divide-ink/5">
              {summary?.lowStockProducts?.length === 0 ? (
                <div className="py-12 text-center text-xs text-ink/50">
                  All pieces are comfortably stocked above safety thresholds.
                </div>
              ) : (
                summary?.lowStockProducts?.map((prod) => (
                  <div key={prod.id} className="py-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <img
                        src={prod.images?.[0] || 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=120&q=80'}
                        alt={prod.name}
                        className="size-10 rounded-lg object-cover bg-stone-100"
                      />
                      <div>
                        <p className="font-medium text-ink line-clamp-1">{prod.name}</p>
                        <p className="text-[11px] text-ink/50">{prod.category?.name}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          prod.stock === 0
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {prod.stock === 0 ? 'Out of Stock' : `${prod.stock} Left`}
                      </span>

                      <button
                        onClick={() => restockMutation.mutate({ product: prod, addQty: 10 })}
                        disabled={restockMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-md border border-ink/15 px-2 py-1 text-[11px] font-semibold text-ink hover:border-ink transition disabled:opacity-40"
                        title="Quick restock +10 units"
                      >
                        <RefreshCw size={11} className={restockMutation.isPending ? 'animate-spin' : ''} />
                        <span>+10</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
