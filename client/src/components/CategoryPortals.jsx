const CATEGORIES = [
  {
    slug: 'essentials',
    name: 'Essentials',
    image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=800&q=80',
  },
  {
    slug: 'outerwear',
    name: 'Outerwear',
    image: 'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=800&q=80',
  },
  {
    slug: 'denim-trousers',
    name: 'Denim',
    image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=800&q=80',
  },
  {
    slug: 'accessories',
    name: 'Accessories',
    image: 'https://images.unsplash.com/photo-1616046229478-9901c5536a45?auto=format&fit=crop&w=800&q=80',
  },
];

export function CategoryPortals({ activeCategory, onSelectCategory }) {
  return (
    <section className="py-14 sm:py-20 border-b border-stone-200 bg-[#FAF9F6]">
      <div className="container-page">
        <div className="mb-8 flex items-baseline justify-between">
          <h2 className="font-serif text-2xl sm:text-3xl font-normal text-charcoal">
            Shop by Category
          </h2>
          <button
            onClick={() => onSelectCategory('')}
            className="text-xs font-medium text-charcoal/60 hover:text-charcoal transition-colors underline underline-offset-4"
          >
            View All
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {CATEGORIES.map((cat) => {
            const isSelected = activeCategory === cat.slug;
            return (
              <button
                key={cat.slug}
                onClick={() => onSelectCategory(cat.slug)}
                className={`group relative aspect-[3/4] w-full overflow-hidden bg-stone-100 text-left transition-all ${
                  isSelected ? 'ring-2 ring-charcoal' : ''
                }`}
              >
                <img
                  src={cat.image}
                  alt={cat.name}
                  className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                />

                {/* Clean gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

                {/* Label */}
                <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 text-white flex items-center justify-between">
                  <span className="font-serif text-lg sm:text-xl font-normal">
                    {cat.name}
                  </span>
                  <span className="text-xs opacity-80 group-hover:opacity-100 transition-opacity">
                    Shop &rarr;
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
