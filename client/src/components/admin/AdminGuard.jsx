import { ShieldAlert, ArrowLeft, LogIn } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export function AdminGuard({ children }) {
  const { user, isLoading, openAuthModal } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F7F6F2] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="size-8 border border-charcoal border-t-transparent animate-spin" />
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted">
            Verifying Studio Credentials...
          </p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-[#F7F6F2] flex items-center justify-center p-6">
        <div className="max-w-md w-full border border-stone-300 bg-white p-8 sm:p-10 shadow-card text-center">
          <div className="mx-auto size-14 border border-charcoal bg-[#F4F2EC] grid place-items-center text-charcoal mb-4">
            <ShieldAlert size={26} />
          </div>
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted">RESTRICTED SECTOR</span>
          <h1 className="font-serif text-2xl font-normal text-charcoal mt-1">Administrator Access Required</h1>
          <p className="mt-2 text-xs text-muted leading-relaxed font-light">
            The studio operations console is strictly reserved for verified personnel.
          </p>

          <div className="mt-6 space-y-3">
            <button
              onClick={() => openAuthModal('login')}
              className="button-primary w-full flex items-center justify-center gap-2 text-xs"
            >
              <LogIn size={14} />
              <span>Sign In as Administrator</span>
            </button>
            <Link
              to="/"
              className="button-secondary w-full flex items-center justify-center gap-2 text-xs"
            >
              <ArrowLeft size={14} />
              <span>Back to Storefront</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
