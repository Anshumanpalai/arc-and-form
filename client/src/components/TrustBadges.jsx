const PLEDGES = [
  {
    code: '01',
    title: 'Complimentary Insured Courier',
    description: 'On all orders exceeding $150. Tracked door-to-door with digital signature confirmation.',
  },
  {
    code: '02',
    title: '100% Biodegradable Packaging',
    description: 'Certified FSC unbleached fiber boxes and compostable glassine garment sleeves.',
  },
  {
    code: '03',
    title: 'Two-Year Atelier Quality Pledge',
    description: 'All structural bar-tacking, selvedge seams, and horn buttons backed by full studio warranty.',
  },
  {
    code: '04',
    title: 'Effortless 30-Day Door-to-Door Returns',
    description: 'Prepaid return labels included with every shipment. Zero restocking fees, instant refunds.',
  },
];

export function TrustBadges() {
  return (
    <section className="py-16 sm:py-20 border-b border-stone-200 bg-[#F7F6F2]">
      <div className="container-page">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {PLEDGES.map((item) => (
            <div
              key={item.code}
              className="border-t border-stone-300 pt-5 space-y-2 flex flex-col justify-between"
            >
              <div>
                <span className="text-[10px] font-mono tracking-widest text-muted uppercase">
                  PLEDGE // {item.code}
                </span>
                <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-charcoal mt-1">
                  {item.title}
                </h4>
                <p className="mt-2 text-xs text-muted leading-relaxed font-light">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
