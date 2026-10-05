import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RouteErrorBoundary as ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ScrollToTop } from './components/ScrollToTop';
import { Spinner } from './components/ui/Spinner';
import { AdminLayout } from './layouts/AdminLayout';
import { ShopkeeperLayout } from './layouts/ShopkeeperLayout';

// Route-level code splitting: each page loads on demand so first paint on
// phones stays fast. Layouts and providers stay in the main chunk.
const Login = lazy(() => import('./pages/Login'));
const NotFound = lazy(() => import('./pages/NotFound'));
const SaleInvoice = lazy(() => import('./pages/SaleInvoice'));

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'));
const AdminProductForm = lazy(() => import('./pages/admin/AdminProductForm'));
const AdminCategories = lazy(() => import('./pages/admin/AdminCategories'));
const AdminShopkeepers = lazy(() => import('./pages/admin/AdminShopkeepers'));
const AdminInventory = lazy(() => import('./pages/admin/AdminInventory'));
const AdminSales = lazy(() => import('./pages/admin/AdminSales'));
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminAssistant = lazy(() => import('./pages/admin/AdminAssistant'));
const AdminActivity = lazy(() => import('./pages/admin/AdminActivity'));
const AdminExpenses = lazy(() => import('./pages/admin/AdminExpenses'));
const AdminDamage = lazy(() => import('./pages/admin/AdminDamage'));
const AdminDebt = lazy(() => import('./pages/admin/AdminDebt'));

const ShopkeeperHome = lazy(() => import('./pages/shopkeeper/ShopkeeperHome'));
const ShopkeeperDebt = lazy(() => import('./pages/shopkeeper/ShopkeeperDebt'));
const ShopkeeperStock = lazy(() => import('./pages/shopkeeper/ShopkeeperStock'));
const RecordSale = lazy(() => import('./pages/shopkeeper/RecordSale'));
const ShopkeeperToday = lazy(() => import('./pages/shopkeeper/ShopkeeperToday'));
const DailyClosing = lazy(() => import('./pages/shopkeeper/DailyClosing'));
const ShopkeeperExpenses = lazy(() => import('./pages/shopkeeper/ShopkeeperExpenses'));
const ReportDamage = lazy(() => import('./pages/shopkeeper/ReportDamage'));

const PageLoader = () => (
  <div className="grid min-h-screen place-items-center bg-slate-100">
    <Spinner />
  </div>
);

const App = () => (
  <ToastProvider>
  <ThemeProvider>
  <AuthProvider>
    <LanguageProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route index element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />

            <Route path="/admin" element={<ProtectedRoute roles={['ADMIN']} />}>
              <Route element={<AdminLayout />}>
                <Route index element={<ErrorBoundary><AdminDashboard /></ErrorBoundary>} />
                <Route path="products" element={<ErrorBoundary><AdminProducts /></ErrorBoundary>} />
                <Route path="products/new" element={<ErrorBoundary><AdminProductForm /></ErrorBoundary>} />
                <Route path="products/:id" element={<ErrorBoundary><AdminProductForm /></ErrorBoundary>} />
                <Route path="categories" element={<ErrorBoundary><AdminCategories /></ErrorBoundary>} />
                <Route path="shopkeepers" element={<ErrorBoundary><AdminShopkeepers /></ErrorBoundary>} />
                <Route path="inventory" element={<ErrorBoundary><AdminInventory /></ErrorBoundary>} />
                <Route path="sales" element={<ErrorBoundary><AdminSales /></ErrorBoundary>} />
                <Route path="analytics" element={<ErrorBoundary><AdminAnalytics /></ErrorBoundary>} />
                <Route path="reports" element={<ErrorBoundary><AdminReports /></ErrorBoundary>} />
                <Route path="assistant" element={<ErrorBoundary><AdminAssistant /></ErrorBoundary>} />
                <Route path="activity" element={<ErrorBoundary><AdminActivity /></ErrorBoundary>} />
                <Route path="expenses" element={<ErrorBoundary><AdminExpenses /></ErrorBoundary>} />
                <Route path="damage" element={<ErrorBoundary><AdminDamage /></ErrorBoundary>} />
                <Route path="credit" element={<ErrorBoundary><AdminDebt /></ErrorBoundary>} />
                <Route path="sales/:id" element={<ErrorBoundary><SaleInvoice /></ErrorBoundary>} />
              </Route>
            </Route>

            <Route path="/shopkeeper" element={<ProtectedRoute roles={['SHOPKEEPER', 'ADMIN']} />}>
              <Route element={<ShopkeeperLayout />}>
                <Route index element={<ErrorBoundary><ShopkeeperHome /></ErrorBoundary>} />
                <Route path="sale" element={<ErrorBoundary><RecordSale /></ErrorBoundary>} />
                <Route path="debt" element={<ErrorBoundary><ShopkeeperDebt /></ErrorBoundary>} />
                <Route path="today" element={<ErrorBoundary><ShopkeeperToday /></ErrorBoundary>} />
                <Route path="damage" element={<ErrorBoundary><ReportDamage /></ErrorBoundary>} />
                <Route path="expenses" element={<ErrorBoundary><ShopkeeperExpenses /></ErrorBoundary>} />
                <Route path="closing" element={<ErrorBoundary><DailyClosing /></ErrorBoundary>} />
                <Route path="stock" element={<ErrorBoundary><ShopkeeperStock /></ErrorBoundary>} />
                <Route path="sales/:id" element={<ErrorBoundary><SaleInvoice /></ErrorBoundary>} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </LanguageProvider>
  </AuthProvider>
  </ThemeProvider>
</ToastProvider>
);

export default App;
