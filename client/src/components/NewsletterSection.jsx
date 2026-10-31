import { useState } from 'react';
import { Check } from 'lucide-react';

export function NewsletterSection() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!email || !email.includes('@')) return;
    setSubscribed(true);
  }

  return (
    <section className="py-16 sm:py-20 border-b border-stone-200 bg-[#FAF9F6]">
      <div className="container-page max-w-xl text-center space-y-4">
        <h2 className="font-serif text-2xl sm:text-3xl font-normal text-charcoal">
          Join the Newsletter
        </h2>
        <p className="text-xs sm:text-sm text-charcoal/70 font-light max-w-md mx-auto">
          Subscribe to receive updates on new arrivals, seasonal collections, and studio stories.
        </p>

        {subscribed ? (
          <div className="mt-6 border border-charcoal bg-white p-4 text-xs text-charcoal font-medium inline-flex items-center gap-2">
            <Check size={16} />
            <span>Thank you for subscribing. We look forward to sharing our updates with you.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="flex-1 border border-stone-300 bg-white px-4 py-3 text-xs text-charcoal placeholder:text-muted outline-none focus:border-charcoal"
            />
            <button
              type="submit"
              className="button-primary whitespace-nowrap px-6 py-3 text-xs tracking-wider"
            >
              Subscribe
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
