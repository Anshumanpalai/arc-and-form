import { Link } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';

export function Footer() {
  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <footer className="border-t border-stone-200 bg-[#FAF9F6] text-charcoal pt-16 pb-12">
      <div className="container-page">
        {/* Main Grid */}
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4 pb-14 border-b border-stone-200">
          {/* Column 1: Brand */}
          <div className="col-span-2 md:col-span-1 space-y-3">
            <Link to="/" className="font-serif text-xl tracking-[0.08em] font-normal text-charcoal">
              ARC &amp; FORM
            </Link>
            <p className="text-xs text-charcoal/70 leading-relaxed font-light">
              Thoughtful modern essentials engineered with architectural utility, longevity, and quiet luxury.
            </p>
          </div>

          {/* Column 2: Shop */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-charcoal">Shop</p>
            <ul className="space-y-2 text-xs text-charcoal/70 font-light">
              <li>
                <Link to="/" className="hover:text-charcoal transition-colors">
                  All Products
                </Link>
              </li>
              <li>
                <Link to="/?category=essentials" className="hover:text-charcoal transition-colors">
                  Essentials
                </Link>
              </li>
              <li>
                <Link to="/?category=outerwear" className="hover:text-charcoal transition-colors">
                  Outerwear
                </Link>
              </li>
              <li>
                <Link to="/?category=denim-trousers" className="hover:text-charcoal transition-colors">
                  Denim
                </Link>
              </li>
              <li>
                <Link to="/?category=accessories" className="hover:text-charcoal transition-colors">
                  Accessories
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Customer Care */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-charcoal">Help</p>
            <ul className="space-y-2 text-xs text-charcoal/70 font-light">
              <li>
                <Link to="/orders" className="hover:text-charcoal transition-colors">
                  Track Your Order
                </Link>
              </li>
              <li>
                <Link to="/orders" className="hover:text-charcoal transition-colors">
                  Order History
                </Link>
              </li>
              <li>
                <span className="text-charcoal/50">Shipping: Complimentary over $150</span>
              </li>
              <li>
                <span className="text-charcoal/50">Returns: 30-Day Window</span>
              </li>
            </ul>
          </div>

          {/* Column 4: About */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-charcoal">About</p>
            <ul className="space-y-2 text-xs text-charcoal/70 font-light">
              <li>
                <a href="#brand-story" className="hover:text-charcoal transition-colors">
                  Our Philosophy
                </a>
              </li>
              <li>
                <a href="#brand-story" className="hover:text-charcoal transition-colors">
                  Materials &amp; Sourcing
                </a>
              </li>
              <li>
                <span className="text-charcoal/50">Contact: concierge@arcandform.com</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-charcoal/60 gap-4">
          <p>© {new Date().getFullYear()} ARC &amp; FORM. All rights reserved.</p>

          <div className="flex items-center gap-6">
            <span>Privacy</span>
            <span>Terms</span>
            <button
              onClick={scrollToTop}
              className="inline-flex items-center gap-1 text-charcoal hover:opacity-75 transition-opacity font-medium"
            >
              <span>Back to Top</span>
              <ArrowUp size={13} />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
