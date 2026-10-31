import { Link } from 'react-router-dom';

export function PlaceholderPage({
  title = 'Page Not Located',
  message = 'The requested specimen or page does not exist in the current collection catalogue.',
}) {
  return (
    <main className="container-page py-28 text-center max-w-lg mx-auto bg-[#F7F6F2]">
      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted mb-2">404 // NOT LOCATED</p>
      <h1 className="font-serif text-3xl sm:text-4xl font-normal text-charcoal">{title}</h1>
      <p className="mt-4 text-xs sm:text-sm text-muted font-light leading-relaxed">{message}</p>
      <Link to="/" className="button-primary mt-8 inline-block text-xs">
        Return to Archive
      </Link>
    </main>
  );
}
