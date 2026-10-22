import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useEffect, useState, lazy, Suspense } from 'react';
import { useAppStore, restoreEmployeeSession, restoreCustomerSession } from "./store";

// 角色选择
const SelectRole = lazy(() => import('./pages/SelectRole'));

// 顾客端
const ChangePassword = lazy(() => import('./pages/customer/ChangePassword'));
const CustomerLogin = lazy(() => import('./pages/customer/Login'));
const ShopDetail = lazy(() => import('./pages/customer/ShopDetail'));
const Booking = lazy(() => import('./pages/customer/Booking'));
const Queue = lazy(() => import('./pages/customer/Queue'));
const Profile = lazy(() => import('./pages/customer/Profile'));
const ReviewPage = lazy(() => import('./pages/customer/Review'));
const RefundPage = lazy(() => import('./pages/customer/Refund'));
const Feedback = lazy(() => import('./pages/customer/Feedback'));
const ProductList = lazy(() => import('./pages/customer/ProductList'));
const ProductDetail = lazy(() => import('./pages/customer/ProductDetail'));
const Cart = lazy(() => import('./pages/customer/Cart'));
const ProductOrders = lazy(() => import('./pages/customer/ProductOrders'));
const MyCoupons = lazy(() => import('./pages/customer/MyCoupons'));
const CustomerInvite = lazy(() => import('./pages/customer/Invite'));
const CustomerPackages = lazy(() => import('./pages/customer/Packages'));
const InviteLanding = lazy(() => import('./pages/InviteLanding'));

// 理发店端
const ShopLogin = lazy(() => import('./pages/shop/Login'));
const Dashboard = lazy(() => import('./pages/shop/Dashboard'));
const ShopManage = lazy(() => import('./pages/shop/Manage'));
const StylistDashboard = lazy(() => import('./pages/shop/StylistDashboard'));
const FinancialReport = lazy(() => import('./pages/shop/FinancialReport'));
const OwnerDashboard = lazy(() => import('./pages/shop/OwnerDashboard'));
const CustomerInsights = lazy(() => import('./pages/shop/CustomerInsights'));
const RefundManagement = lazy(() => import('./pages/shop/RefundManagement'));
const ProductManagement = lazy(() => import('./pages/shop/ProductManagement'));
const ProductOrderManagement = lazy(() => import('./pages/shop/ProductOrderManagement'));
const CouponManagement = lazy(() => import('./pages/shop/CouponManagement'));
const GroupBuyManagement = lazy(() => import('./pages/shop/GroupBuyManagement'));
const CustomerManagement = lazy(() => import('./pages/shop/CustomerManagement'));
const CustomerTableManagement = lazy(() => import('./pages/shop/CustomerTableManagement'));
const SettlementManagement = lazy(() => import('./pages/shop/SettlementManagement'));
const MembershipManagement = lazy(() => import('./pages/shop/MembershipManagement'));
const VIPConfigManagement = lazy(() => import('./pages/shop/VIPConfigManagement'));
const SatisfactionSurveyManagement = lazy(() => import('./pages/shop/SatisfactionSurveyManagement'));
const ReviewManagement = lazy(() => import('./pages/shop/ReviewManagement'));
const CustomerProfileForm = lazy(() => import('./pages/shop/CustomerProfileForm'));
const CustomerRecall = lazy(() => import('./pages/shop/CustomerRecall'));
const BookingManagement = lazy(() => import('./pages/shop/BookingManagement'));
const Checkout = lazy(() => import('./pages/shop/Checkout'));
const Packages = lazy(() => import('./pages/shop/Packages'));

// 默认店铺ID
const DEFAULT_SHOP_ID = "shop1";

// 从 localStorage 判断是否存在员工会话（同步，用于路由守卫首次渲染）
const hasEmployeeSession = (): boolean => {
  try {
    const raw = localStorage.getItem('mbs_employee_session');
    if (!raw) return false;
    const session = JSON.parse(raw) as { currentEmployee?: { id?: string } | null };
    return !!session?.currentEmployee?.id;
  } catch (_e) {
    return false;
  }
};

// 从 localStorage 判断是否存在顾客会话（同步，用于路由守卫首次渲染）
const hasCustomerSession = (): boolean => {
  try {
    const raw = localStorage.getItem('mbs_customer_session');
    if (!raw) return false;
    const session = JSON.parse(raw) as { id?: string } | null;
    return !!session?.id;
  } catch (_e) {
    return false;
  }
};

// 理发店端路由守卫：未登录时重定向到 /shop/login
const ShopRouteGuard = () => {
  const { currentShop, currentEmployee, hasHydrated } = useAppStore();
  const [checked, setChecked] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let active=true;
    (async()=>{if(!checked && hasEmployeeSession()) await restoreEmployeeSession();if(active) setChecked(true);})();
    return ()=>{active=false;};
  }, [checked]);

  // 等待持久化恢复完成后再判断登录态，避免刷新时误判为未登录
  if (!hasHydrated || !checked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        加载中...
      </div>
    );
  }
  if (!currentShop && !currentEmployee && location.pathname !== "/shop/login") {
    return <Navigate to="/shop/login" replace />;
  }
  return <Outlet />;
};

// 顾客端路由守卫：未登录时重定向到 /customer/login
const CustomerRouteGuard = () => {
  const { currentCustomer, hasHydrated } = useAppStore();
  const [checked, setChecked] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let active = true;
    const restore = async () => {
      if (hasCustomerSession()) await restoreCustomerSession();
      if (active) setChecked(true);
    };
    void restore();
    return () => { active = false; };
  }, []);

  if (!hasHydrated || !checked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        加载中...
      </div>
    );
  }
  if (!currentCustomer && location.pathname !== "/customer/login") {
    return <Navigate to="/customer/login" replace />;
  }
  return <Outlet />;
};

// 包含公开顾客页面：已登录的受限账号不能通过地址栏绕开改密。
const CustomerPasswordGate = () => {
  const customer = useAppStore(state => state.currentCustomer);
  const location = useLocation();
  if (customer?.mustChangePassword && location.pathname.startsWith('/customer') && location.pathname !== '/customer/change-password') {
    return <Navigate to="/customer/change-password" replace />;
  }
  return <Outlet />;
};

// 店铺专属入口重定向组件
const ShopRedirect = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/customer/shop/${shopId || DEFAULT_SHOP_ID}`, { replace: true });
  }, [shopId, navigate]);
  return null;
};

export default function App() {
  const { hasHydrated } = useAppStore();

  useEffect(() => {
    if (!hasHydrated) return;
    // 从独立的会话存储中恢复登录态，避免多角色共用同一 key 互相覆盖
    if(window.location.pathname.startsWith('/shop')) void restoreEmployeeSession();
    else void restoreCustomerSession();
  }, [hasHydrated]);

  return (
    <Router>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">加载中...</div>}>
      <Routes>
        {/* 首页显示角色选择 */}
        <Route path="/" element={<SelectRole />} />

        {/* 角色选择页面 */}
        <Route path="/select-role" element={<SelectRole />} />

        <Route element={<CustomerPasswordGate />}>
        {/* 顾客端路由 */}
        <Route path="/customer/login" element={<CustomerLogin />} />
        <Route path="/customer" element={<Navigate to={`/customer/shop/${DEFAULT_SHOP_ID}`} replace />} />
        <Route path="/customer/shop/:id" element={<ShopDetail />} />
        <Route path="/customer/products/:shopId" element={<ProductList />} />
        <Route path="/customer/product/:shopId/:productId" element={<ProductDetail />} />
        <Route path="/customer/booking/:shopId" element={<Booking />} />
        <Route path="/customer/queue/:bookingId" element={<Queue />} />
        <Route element={<CustomerRouteGuard />}>
          <Route path="/customer/change-password" element={<ChangePassword />} />
          <Route path="/customer/profile" element={<Profile />} />
          <Route path="/customer/packages" element={<CustomerPackages />} />
          <Route path="/customer/invite" element={<CustomerInvite />} />
          <Route path="/customer/cart/:shopId" element={<Cart />} />
          <Route path="/customer/product-orders/:shopId" element={<ProductOrders />} />
          <Route path="/customer/coupons" element={<MyCoupons />} />
          <Route path="/customer/review/:bookingId" element={<ReviewPage />} />
          <Route path="/customer/refund" element={<RefundPage />} />
          <Route path="/customer/feedback" element={<Feedback />} />
        </Route>

        </Route>

        {/* 理发店端路由 */}
        <Route path="/shop/login" element={<ShopLogin />} />
        <Route element={<ShopRouteGuard />}>
          <Route path="/shop" element={<Dashboard />} />
          <Route path="/shop/manage" element={<ShopManage />} />
          <Route path="/shop/products" element={<ProductManagement />} />
          <Route path="/shop/product-orders" element={<ProductOrderManagement />} />
          <Route path="/shop/coupons" element={<CouponManagement />} />
          <Route path="/shop/packages" element={<Packages />} />
          <Route path="/shop/group-buy" element={<GroupBuyManagement />} />
          <Route path="/shop/reviews" element={<ReviewManagement />} />
          <Route path="/shop/stylist" element={<StylistDashboard />} />
          <Route path="/shop/financial" element={<FinancialReport />} />
          <Route path="/shop/owner" element={<OwnerDashboard />} />
          <Route path="/shop/customer-insights" element={<CustomerInsights />} />
          <Route path="/shop/refunds" element={<RefundManagement />} />
          <Route path="/shop/customers" element={<CustomerManagement />} />
          <Route path="/shop/customers-table" element={<CustomerTableManagement />} />
          <Route path="/shop/bookings" element={<BookingManagement />} />
          <Route path="/shop/checkout" element={<Checkout />} />
          <Route path="/shop/settlement" element={<SettlementManagement />} />
          <Route path="/shop/membership" element={<MembershipManagement />} />
          <Route path="/shop/vip-configs" element={<VIPConfigManagement />} />
          <Route path="/shop/survey" element={<SatisfactionSurveyManagement />} />
          <Route path="/shop/review-management" element={<ReviewManagement />} />
          <Route path="/shop/customer-profile" element={<CustomerManagement />} />
          <Route path="/shop/customer-profile/:customerId" element={<CustomerProfileForm />} />
          <Route path="/shop/customer-recall" element={<CustomerRecall />} />
        </Route>

        {/* 店铺专属入口（保留短链，但移除 /shop/:shopId 通配，避免误匹配管理端路径） */}
        <Route path="/s/:shopId" element={<ShopRedirect />} />
        <Route path="/invite" element={<InviteLanding />} />
      </Routes>
      </Suspense>
    </Router>
  );
}
