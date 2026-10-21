import React from 'react';
import { useAuth } from './features/auth/hooks/useAuth';
import { AuthPage } from './features/auth/AuthPage';
import { OrdersPage } from './features/orders/OrdersPage';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { LoadingSpinner } from './components/ui/LoadingSpinner';

export const App: React.FC = () => {
  const { user, authChecking, logout, setUser } = useAuth();

if (authChecking) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}

  // 2. Unauthenticated State
  if (!user) {
    return <AuthPage onLoginSuccess={setUser} />;
  }

  // 3. Authenticated State: Modular layout with Navbar, Main Content, and Footer
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col justify-between">
      <Navbar user={user} onLogout={logout} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3.5 sm:px-6 md:px-8 py-4 sm:py-6">
        <OrdersPage userRole={user.role} />
      </main>

      <Footer />
    </div>
  );
};

export default App;
