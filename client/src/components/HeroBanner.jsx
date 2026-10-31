import { ArrowDown } from 'lucide-react';

export function HeroBanner() {
  function scrollToProducts() {
    const el = document.getElementById('product-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <section className="relative bg-[#FAF9F6] border-b border-stone-200">
      <div className="container-page py-12 sm:py-20 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
          {/* Text Content */}
          <div className="lg:col-span-6 space-y-6">
            <h1 className="font-serif text-4xl sm:text-6xl font-normal leading-[1.1] text-charcoal tracking-tight">
              Modern essentials, <br />
              architectural form.
            </h1>

            <p className="max-w-md text-base sm:text-lg text-charcoal/70 leading-relaxed font-light">
              Thoughtful everyday pieces crafted from premium natural textiles, built for longevity and effortless daily wear.
            </p>

            <div className="pt-2">
              <button
                onClick={scrollToProducts}
                className="button-primary inline-flex items-center gap-2 px-8 py-4 text-xs font-medium tracking-[0.15em]"
              >
                <span>Shop Collection</span>
                <ArrowDown size={14} />
              </button>
            </div>
          </div>

          {/* Large Clean Fashion Image */}
          <div className="lg:col-span-6">
            <div className="relative aspect-[4/5] sm:aspect-[3/4] w-full overflow-hidden bg-stone-100">
              <img
                src="https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=1400&q=85"
                alt="ARC & FORM Modern Essentials Collection"
                className="size-full object-cover transition-transform duration-700 hover:scale-[1.02]"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
