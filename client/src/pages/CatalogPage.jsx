import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProductCard } from '../components/ProductCard';
import { ProductSkeleton } from '../components/ProductSkeleton';
import { HeroBanner } from '../components/HeroBanner';
import { CategoryPortals } from '../components/CategoryPortals';
import { BrandManifesto } from '../components/BrandManifesto';
import { NewsletterSection } from '../components/NewsletterSection';
import { useCategories, useProducts } from '../hooks/useCatalog';

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = useState(params.get('search') || '');

  const filters = {
    page: params.get('page') || '1',
    search: params.get('search') || '',
    category: params.get('category') || '',
    sort: params.get('sort') || 'newest',
  };

  const productsQuery = useProducts(filters);
  const categoriesQuery = useCategories();

  useEffect(() => {
    setSearchText(params.get('search') || '');
  }, [params]);

  function updateFilters(patch) {
    const next = new URLSearchParams(params);
    Object.entries({ ...patch, page: patch.page || '1' }).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    setParams(next);
  }

  function submitSearch(e) {
    e.preventDefault();
    updateFilters({ search: searchText });
  }

  function clearSearch() {
    setSearchText('');
    updateFilters({ search: '' });
  }

  const data = productsQuery.data;
  const categories = categoriesQuery.data?.categories || [];
  const activeCategoryObj = categories.find((c) => c.slug === filters.category);

  return (
    <div className="flex flex-col bg-[#FAF9F6]">
      {/* 1. Hero */}
      <HeroBanner />

      {/* 2. Shop by Category */}
      <CategoryPortals
        activeCategory={filters.category}
        onSelectCategory={(slug) => {
          updateFilters({ category: slug });
          const el = document.getElementById('product-section');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      {/* 3. Product Collection (4 per row desktop, 2 per row mobile) */}
      <main id="product-section" className="container-page py-14 sm:py-20">
        {/* Section Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between border-b border-stone-200 pb-6 gap-4">
          <div>
            <h2 className="font-serif text-2xl sm:text-4xl font-normal text-charcoal">
              {activeCategoryObj ? activeCategoryObj.name : 'All Products'}
            </h2>
            <p className="text-xs text-charcoal/60 mt-1">
              {data?.pagination ? `${data.pagination.total} pieces available` : 'Curated wardrobe pieces'}
            </p>
          </div>

          {/* Clean Category Filter Tabs */}
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              onClick={() => updateFilters({ category: '' })}
              className={`px-3 py-1.5 transition-colors ${
                filters.category === ''
                  ? 'bg-charcoal text-white font-medium'
                  : 'bg-white text-charcoal border border-stone-200 hover:border-charcoal'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id || cat.slug}
                onClick={() => updateFilters({ category: cat.slug })}
                className={`px-3 py-1.5 transition-colors ${
                  filters.category === cat.slug
                    ? 'bg-charcoal text-white font-medium'
                    : 'bg-white text-charcoal border border-stone-200 hover:border-charcoal'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Search & Sort Controls */}
        <div className="mb-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Search */}
          <form onSubmit={submitSearch} className="relative w-full sm:max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search products..."
              className="w-full border border-stone-200 bg-white py-2 pl-9 pr-8 text-xs text-charcoal placeholder:text-muted outline-none focus:border-charcoal"
            />
            {searchText && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-charcoal"
              >
                <X size={13} />
              </button>
            )}
          </form>

          {/* Sort */}
          <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-charcoal">
            <span className="text-charcoal/60">Sort by:</span>
            <select
              value={filters.sort}
              onChange={(e) => updateFilters({ sort: e.target.value })}
              className="border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-charcoal outline-none cursor-pointer focus:border-charcoal"
            >
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>
        </div>

        {/* Error State */}
        {productsQuery.isError && (
          <div className="border border-red-200 bg-red-50 p-6 text-xs text-red-700 my-6">
            <p className="font-semibold">Unable to load collection</p>
            <p className="mt-1">{productsQuery.error.message}</p>
          </div>
        )}

        {/* Product Grid: Exactly 4 per row on desktop, 2 per row on mobile */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-10 sm:gap-x-6 sm:gap-y-12">
          {productsQuery.isLoading
            ? Array.from({ length: 8 }, (_, index) => <ProductSkeleton key={index} />)
            : data?.products?.map((product) => (
                <ProductCard key={product.id || product.slug} product={product} />
              ))}
        </div>

        {/* Empty State */}
        {!productsQuery.isLoading && data?.products?.length === 0 && (
          <div className="py-20 text-center border border-stone-200 bg-white p-8 max-w-md mx-auto">
            <h3 className="font-serif text-xl font-normal text-charcoal">No products found</h3>
            <p className="mt-2 text-xs text-charcoal/60">
              Try adjusting your search terms or clearing selected category filters.
            </p>
            <button
              onClick={() => {
                setParams({});
                setSearchText('');
              }}
              className="button-secondary mt-6 text-xs"
            >
              Reset Filters
            </button>
          </div>
        )}

        {/* Pagination */}
        {data?.pagination && data.pagination.pages > 1 && (
          <nav className="mt-16 flex items-center justify-center gap-3" aria-label="Pagination">
            <button
              className="button-secondary text-xs py-2 px-4"
              disabled={Number(filters.page) <= 1}
              onClick={() => updateFilters({ page: String(Number(filters.page) - 1) })}
            >
              Previous
            </button>
            <span className="text-xs text-charcoal/60 font-medium px-2">
              Page {data.pagination.page} of {data.pagination.pages}
            </span>
            <button
              className="button-secondary text-xs py-2 px-4"
              disabled={Number(filters.page) >= data.pagination.pages}
              onClick={() => updateFilters({ page: String(Number(filters.page) + 1) })}
            >
              Next
            </button>
          </nav>
        )}
      </main>

      {/* 4. Short Brand Story */}
      <div id="brand-story">
        <BrandManifesto />
      </div>

      {/* 5. Newsletter */}
      <NewsletterSection />
    </div>
  );
}
