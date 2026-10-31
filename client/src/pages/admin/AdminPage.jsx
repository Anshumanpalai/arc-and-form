import { useState } from 'react';
import { ArrowLeft, LayoutDashboard, Package, ShoppingBag, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdminGuard } from '../../components/admin/AdminGuard';
import { AdminOverviewTab } from './AdminOverviewTab';
import { AdminOrdersTab } from './AdminOrdersTab';
import { AdminProductsTab } from './AdminProductsTab';
import { useAuthStore } from '../../store/authStore';

export function AdminPage() {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'orders' | 'products'
  const user = useAuthStore((state) => state.user);

  return (
    <AdminGuard>
      <div className="min-h-screen bg-[#F7F6F2] text-charcoal pb-20">
        {/* Studio Admin Header */}
        <header className="sticky top-0 z-30 border-b border-stone-300 bg-white/95 backdrop-blur-md">
          <div className="container-page flex h-18 items-center justify-between py-4">
            {/* Left: Branding & Back to Store */}
            <div className="flex items-center gap-6">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-muted hover:text-charcoal transition-colors"
              >
                <ArrowLeft size={13} />
                <span className="hidden sm:inline">Return to Storefront</span>
              </Link>

              <div className="h-4 w-px bg-stone-300 hidden sm:block" />

              <div className="flex items-center gap-3">
                <span className="font-serif text-xl font-normal tracking-[0.06em] text-charcoal">
                  ARC &amp; FORM
                </span>
                <span className="border border-stone-300 bg-[#F4F2EC] px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-charcoal">
                  Studio Operations
                </span>
              </div>
            </div>

            {/* Right: Admin User Indicator */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-mono text-charcoal border border-stone-300 bg-[#F4F2EC] px-3 py-1">
                <Shield size={12} className="text-charcoal" />
                <span>{user?.name || user?.email || 'Administrator'}</span>
              </div>
            </div>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="container-page flex gap-2 sm:gap-6 border-t border-stone-200 pt-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 border-b-2 py-3 px-1 text-[10px] font-mono uppercase tracking-[0.2em] transition-all whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'border-charcoal text-charcoal font-semibold'
                  : 'border-transparent text-muted hover:text-charcoal'
              }`}
            >
              <LayoutDashboard size={14} />
              <span>Studio Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('orders')}
              className={`flex items-center gap-2 border-b-2 py-3 px-1 text-[10px] font-mono uppercase tracking-[0.2em] transition-all whitespace-nowrap ${
                activeTab === 'orders'
                  ? 'border-charcoal text-charcoal font-semibold'
                  : 'border-transparent text-muted hover:text-charcoal'
              }`}
            >
              <Package size={14} />
              <span>Orders &amp; Shipments</span>
            </button>

            <button
              onClick={() => setActiveTab('products')}
              className={`flex items-center gap-2 border-b-2 py-3 px-1 text-[10px] font-mono uppercase tracking-[0.2em] transition-all whitespace-nowrap ${
                activeTab === 'products'
                  ? 'border-charcoal text-charcoal font-semibold'
                  : 'border-transparent text-muted hover:text-charcoal'
              }`}
            >
              <ShoppingBag size={14} />
              <span>Pieces &amp; Inventory</span>
            </button>
          </div>
        </header>

        {/* Tab Content Container */}
        <main className="container-page py-8">
          {activeTab === 'overview' && (
            <AdminOverviewTab onNavigateTab={(tab) => setActiveTab(tab)} />
          )}
          {activeTab === 'orders' && <AdminOrdersTab />}
          {activeTab === 'products' && <AdminProductsTab />}
        </main>
      </div>
    </AdminGuard>
  );
}
