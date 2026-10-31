import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export function AuthModal() {
  const { user, isAuthModalOpen, authMode, closeAuthModal, setAuthMode, login, register, logout } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isAuthModalOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (authMode === 'login') {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      setName('');
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify your details.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function fillDemo(emailVal, passVal) {
    setEmail(emailVal);
    setPassword(passVal);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 transition-opacity"
        onClick={closeAuthModal}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-sm bg-white border border-stone-200 p-6 sm:p-8 shadow-xl z-10">
        <button
          onClick={closeAuthModal}
          className="absolute right-4 top-4 p-1 text-stone-400 hover:text-charcoal transition-colors"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        {user ? (
          /* User Profile View */
          <div className="space-y-4 pt-1">
            <div className="border-b border-stone-200 pb-3">
              <h2 className="font-serif text-xl font-normal text-charcoal">
                My Account
              </h2>
              <p className="text-xs text-charcoal/70 mt-1">{user?.email}</p>
            </div>

            <div className="space-y-2 pt-1">
              {user.role === 'ADMIN' && (
                <Link
                  to="/admin"
                  onClick={closeAuthModal}
                  className="button-primary w-full text-center text-xs py-2.5 block"
                >
                  Admin Dashboard
                </Link>
              )}
              <Link
                to="/orders"
                onClick={closeAuthModal}
                className="button-secondary w-full text-center text-xs py-2.5 block"
              >
                Order History
              </Link>
              <button
                onClick={async () => {
                  await logout();
                  closeAuthModal();
                }}
                className="w-full text-xs text-charcoal/60 hover:text-charcoal py-2 text-center underline underline-offset-4"
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          /* Sign In / Register Form */
          <div>
            <div className="mb-6 flex border-b border-stone-200">
              <button
                onClick={() => {
                  setAuthMode('login');
                  setError('');
                }}
                className={`flex-1 pb-2.5 text-xs font-medium uppercase tracking-wider transition-colors relative ${
                  authMode === 'login'
                    ? 'text-charcoal font-semibold'
                    : 'text-stone-400 hover:text-charcoal'
                }`}
              >
                Sign In
                {authMode === 'login' && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-charcoal" />
                )}
              </button>
              <button
                onClick={() => {
                  setAuthMode('register');
                  setError('');
                }}
                className={`flex-1 pb-2.5 text-xs font-medium uppercase tracking-wider transition-colors relative ${
                  authMode === 'register'
                    ? 'text-charcoal font-semibold'
                    : 'text-stone-400 hover:text-charcoal'
                }`}
              >
                Create Account
                {authMode === 'register' && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-charcoal" />
                )}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div role="alert" className="border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                  {error}
                </div>
              )}

              {authMode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-charcoal mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full border border-stone-300 bg-white px-3 py-2 text-xs text-charcoal outline-none focus:border-charcoal"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-charcoal mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full border border-stone-300 bg-white px-3 py-2 text-xs text-charcoal outline-none focus:border-charcoal"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-charcoal mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={authMode === 'register' ? 8 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={authMode === 'register' ? 'At least 8 characters' : 'Enter password'}
                  className="w-full border border-stone-300 bg-white px-3 py-2 text-xs text-charcoal outline-none focus:border-charcoal"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="button-primary w-full mt-2 py-3 text-xs tracking-wider"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    <span>Processing...</span>
                  </span>
                ) : authMode === 'login' ? (
                  'Sign In'
                ) : (
                  'Create Account'
                )}
              </button>

              {/* Demo Accounts */}
              <div className="mt-4 border-t border-stone-100 pt-3 text-[11px] text-stone-500">
                <span className="block mb-1.5">Quick fill demo account:</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fillDemo('admin@arcandform.com', 'Admin@123!')}
                    className="flex-1 border border-stone-200 py-1 hover:border-charcoal transition-colors text-charcoal"
                  >
                    Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemo('customer@arcandform.com', 'Customer@123!')}
                    className="flex-1 border border-stone-200 py-1 hover:border-charcoal transition-colors text-charcoal"
                  >
                    Customer
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
