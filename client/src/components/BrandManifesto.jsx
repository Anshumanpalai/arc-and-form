export function BrandManifesto() {
  return (
    <section className="py-16 sm:py-24 border-b border-stone-200 bg-[#F4F2EC]/60">
      <div className="container-page max-w-4xl text-center space-y-6">
        <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-charcoal tracking-tight">
          Thoughtful Design, Enduring Quality
        </h2>

        <p className="text-base sm:text-lg text-charcoal/75 font-light leading-relaxed max-w-2xl mx-auto">
          ARC &amp; FORM creates modern wardrobe essentials grounded in architectural minimalism, natural textiles, and timeless silhouettes. Every piece is crafted for comfort, longevity, and effortless daily living.
        </p>

        <div className="pt-6 grid grid-cols-3 gap-6 max-w-xl mx-auto text-center border-t border-stone-300/80">
          <div>
            <p className="font-medium text-xs sm:text-sm text-charcoal">Natural Textiles</p>
            <p className="text-[11px] text-muted mt-0.5">Organic cotton &amp; pure wool</p>
          </div>
          <div>
            <p className="font-medium text-xs sm:text-sm text-charcoal">Responsible Craft</p>
            <p className="text-[11px] text-muted mt-0.5">Generational artisan mills</p>
          </div>
          <div>
            <p className="font-medium text-xs sm:text-sm text-charcoal">Timeless Design</p>
            <p className="text-[11px] text-muted mt-0.5">Built to outlast seasons</p>
          </div>
        </div>
      </div>
    </section>
  );
}
