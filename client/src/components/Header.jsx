import { useState } from 'react';
import { Search, ShoppingBag, User as UserIcon, Shield, Menu, X, ArrowRight } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useCartStore, cartTotalCount } from '../store/cartStore';
import { useAuthStore } from '../store/authStore';

export function Header() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const items = useCartStore((state) => state.items);
  const count = cartTotalCount(items);
  const openCart = useCartStore((state) => state.openCart);

  const user = useAuthStore((state) => state.user);
  const openAuthModal = useAuthStore((state) => state.openAuthModal);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(params.get('search') || '');

  function handleCategoryNav(catSlug) {
    setIsMobileMenuOpen(false);
    if (catSlug) {
      navigate(`/?category=${catSlug}`);
    } else {
      navigate('/');
    }
    const el = document.getElementById('product-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?search=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/');
    }
    setIsSearchOpen(false);
    setIsMobileMenuOpen(false);
    const el = document.getElementById('product-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  const currentCategory = params.get('category');

  return (
    <header className="sticky top-0 z-40 w-full border-b border-stone-200/80 bg-[#FAF9F6]/95 backdrop-blur-md">
      <div className="container-page flex h-16 sm:h-20 items-center justify-between">
        {/* Left: Brand Wordmark */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1 text-charcoal lg:hidden"
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <Link
            to="/"
            className="font-serif text-xl sm:text-2xl font-normal tracking-[0.1em] text-charcoal hover:opacity-80 transition-opacity"
            aria-label="ARC & FORM Home"
          >
            ARC &amp; FORM
          </Link>
        </div>

        {/* Center: Clean Navigation Links (Desktop) */}
        <nav
          className="hidden lg:flex items-center gap-8 text-[13px] font-medium text-charcoal/80"
          aria-label="Primary navigation"
        >
          <button
            onClick={() => handleCategoryNav('')}
            className={`transition-colors hover:text-charcoal ${
              !currentCategory ? 'text-charcoal font-semibold underline underline-offset-8 decoration-1' : ''
            }`}
          >
            All Products
          </button>
          <button
            onClick={() => handleCategoryNav('essentials')}
            className={`transition-colors hover:text-charcoal ${
              currentCategory === 'essentials' ? 'text-charcoal font-semibold underline underline-offset-8 decoration-1' : ''
            }`}
          >
            Essentials
          </button>
          <button
            onClick={() => handleCategoryNav('outerwear')}
            className={`transition-colors hover:text-charcoal ${
              currentCategory === 'outerwear' ? 'text-charcoal font-semibold underline underline-offset-8 decoration-1' : ''
            }`}
          >
            Outerwear
          </button>
          <button
            onClick={() => handleCategoryNav('denim-trousers')}
            className={`transition-colors hover:text-charcoal ${
              currentCategory === 'denim-trousers' ? 'text-charcoal font-semibold underline underline-offset-8 decoration-1' : ''
            }`}
          >
            Denim
          </button>
          <button
            onClick={() => handleCategoryNav('accessories')}
            className={`transition-colors hover:text-charcoal ${
              currentCategory === 'accessories' ? 'text-charcoal font-semibold underline underline-offset-8 decoration-1' : ''
            }`}
          >
            Accessories
          </button>
        </nav>

        {/* Right: Actions (Search, Account, Bag) */}
        <div className="flex items-center gap-4 sm:gap-6 text-[13px] font-medium text-charcoal">
          {/* Search Action */}
          <div className="relative">
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className="flex items-center gap-1.5 p-1 text-charcoal/80 hover:text-charcoal transition-colors"
              aria-label="Search collection"
            >
              <Search size={17} />
              <span className="hidden md:inline">Search</span>
            </button>

            {isSearchOpen && (
              <form
                onSubmit={handleSearchSubmit}
                className="absolute right-0 top-full mt-3 w-72 sm:w-80 border border-stone-300 bg-white p-2 shadow-lg z-50 flex items-center"
              >
                <Search size={15} className="text-muted ml-1.5 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  autoFocus
                  className="w-full bg-transparent px-2.5 py-1 text-xs text-charcoal outline-none placeholder:text-muted"
                />
                <button type="submit" className="p-1 text-charcoal">
                  <ArrowRight size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(false)}
                  className="p-1 text-muted hover:text-charcoal"
                >
                  <X size={14} />
                </button>
              </form>
            )}
          </div>

          {/* Admin link */}
          {user?.role === 'ADMIN' && (
            <Link
              to="/admin"
              className="hidden sm:inline-flex items-center gap-1.5 border border-stone-300 bg-white px-2.5 py-1 text-xs text-charcoal hover:border-charcoal transition-colors"
            >
              <Shield size={12} />
              <span>Admin</span>
            </Link>
          )}

          {/* Account */}
          <button
            onClick={() => openAuthModal('login')}
            className="flex items-center gap-1.5 p-1 text-charcoal/80 hover:text-charcoal transition-colors"
            aria-label="Account"
          >
            <UserIcon size={17} />
            <span className="hidden md:inline">
              {user?.name ? user.name.split(' ')[0] : (user?.email ? 'Account' : 'Account')}
            </span>
          </button>

          {/* Shopping Bag */}
          <button
            onClick={openCart}
            className="flex items-center gap-1.5 border border-charcoal/20 bg-white px-3.5 py-1.5 text-xs text-charcoal hover:border-charcoal transition-colors"
            aria-label={`Open shopping bag, ${count} items`}
          >
            <ShoppingBag size={15} />
            <span>Bag ({count})</span>
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-stone-200 bg-[#FAF9F6] px-6 py-6 transition-all">
          <form onSubmit={handleSearchSubmit} className="mb-6 flex items-center border border-stone-300 bg-white p-2">
            <Search size={16} className="text-muted ml-1" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full bg-transparent px-3 py-1 text-xs text-charcoal outline-none placeholder:text-muted"
            />
            <button type="submit" className="p-1 text-charcoal">
              <ArrowRight size={14} />
            </button>
          </form>

          <nav className="flex flex-col space-y-4 text-sm font-medium text-charcoal pb-6 border-b border-stone-200">
            <button
              onClick={() => handleCategoryNav('')}
              className="text-left py-1 hover:text-muted transition-colors"
            >
              All Products
            </button>
            <button
              onClick={() => handleCategoryNav('essentials')}
              className="text-left py-1 hover:text-muted transition-colors"
            >
              Essentials
            </button>
            <button
              onClick={() => handleCategoryNav('outerwear')}
              className="text-left py-1 hover:text-muted transition-colors"
            >
              Outerwear
            </button>
            <button
              onClick={() => handleCategoryNav('denim-trousers')}
              className="text-left py-1 hover:text-muted transition-colors"
            >
              Denim
            </button>
            <button
              onClick={() => handleCategoryNav('accessories')}
              className="text-left py-1 hover:text-muted transition-colors"
            >
              Accessories
            </button>
          </nav>

          <div className="pt-4 flex items-center justify-between text-xs text-charcoal">
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                openAuthModal('login');
              }}
              className="underline underline-offset-4 font-medium"
            >
              {user ? 'My Profile' : 'Sign In / Register'}
            </button>
            {user?.role === 'ADMIN' && (
              <Link
                to="/admin"
                onClick={() => setIsMobileMenuOpen(false)}
                className="underline underline-offset-4"
              >
                Admin Panel
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
