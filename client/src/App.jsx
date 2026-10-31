import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CartDrawer } from './components/CartDrawer';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { AuthModal } from './components/AuthModal';
import { CatalogPage } from './pages/CatalogPage';
import { ProductPage } from './pages/ProductPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderSuccessPage } from './pages/OrderSuccessPage';
import { OrderHistoryPage } from './pages/OrderHistoryPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { AdminPage } from './pages/admin/AdminPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuthStore } from './store/authStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

function AppContent() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  useEffect(() => {
    useAuthStore.getState().checkAuth();
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF9F6] text-charcoal">
      {!isAdmin && <Header />}
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<CatalogPage />} />
          <Route path="/products/:slug" element={<ProductPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/checkout/success" element={<OrderSuccessPage />} />
          <Route path="/orders" element={<OrderHistoryPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/*" element={<AdminPage />} />
          <Route path="*" element={<PlaceholderPage title="Page Not Found" message="The page you are looking for does not exist." />} />
        </Routes>
      </div>
      {!isAdmin && <Footer />}
      {!isAdmin && <CartDrawer />}
      <AuthModal />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
