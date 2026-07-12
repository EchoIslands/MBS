import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useEffect, useState } from 'react';
import { useAppStore, restoreEmployeeSession, restoreCustomerSession } from "./store";

// 角色选择
import SelectRole from "./pages/SelectRole";

// 顾客端
import CustomerLogin from "./pages/customer/Login";
import ShopDetail from "./pages/customer/ShopDetail";
import Booking from "./pages/customer/Booking";
import Queue from "./pages/customer/Queue";
import Profile from "./pages/customer/Profile";
import ReviewPage from "./pages/customer/Review";
import RefundPage from "./pages/customer/Refund";
import Feedback from "./pages/customer/Feedback";
import ProductList from "./pages/customer/ProductList";
import Cart from "./pages/customer/Cart";

// 理发店端
import ShopLogin from "./pages/shop/Login";
import Dashboard from "./pages/shop/Dashboard";
import ShopManage from "./pages/shop/Manage";
import StylistDashboard from "./pages/shop/StylistDashboard";
import FinancialReport from "./pages/shop/FinancialReport";
import OwnerDashboard from "./pages/shop/OwnerDashboard";
import RefundManagement from "./pages/shop/RefundManagement";
import ProductManagement from "./pages/shop/ProductManagement";
import CustomerManagement from "./pages/shop/CustomerManagement";
import CustomerTableManagement from "./pages/shop/CustomerTableManagement";
import SettlementManagement from "./pages/shop/SettlementManagement";
import MembershipManagement from "./pages/shop/MembershipManagement";
import SatisfactionSurveyManagement from "./pages/shop/SatisfactionSurveyManagement";
import ReviewManagement from "./pages/shop/ReviewManagement";
import CustomerProfileForm from "./pages/shop/CustomerProfileForm";
import CustomerRecall from "./pages/shop/CustomerRecall";
import BookingManagement from "./pages/shop/BookingManagement";
import Checkout from "./pages/shop/Checkout";

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
    if (!checked && hasEmployeeSession()) {
      restoreEmployeeSession();
    }
    setChecked(true);
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
    if (!checked && hasCustomerSession()) {
      restoreCustomerSession();
    }
    setChecked(true);
  }, [checked]);

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
    restoreEmployeeSession();
    restoreCustomerSession();
  }, [hasHydrated]);

  return (
    <Router>
      <Routes>
        {/* 首页显示角色选择 */}
        <Route path="/" element={<SelectRole />} />

        {/* 角色选择页面 */}
        <Route path="/select-role" element={<SelectRole />} />

        {/* 顾客端路由 */}
        <Route path="/customer/login" element={<CustomerLogin />} />
        <Route path="/customer" element={<Navigate to={`/customer/shop/${DEFAULT_SHOP_ID}`} replace />} />
        <Route path="/customer/shop/:id" element={<ShopDetail />} />
        <Route path="/customer/products/:shopId" element={<ProductList />} />
        <Route path="/customer/booking/:shopId" element={<Booking />} />
        <Route path="/customer/queue/:bookingId" element={<Queue />} />
        <Route element={<CustomerRouteGuard />}>
          <Route path="/customer/profile" element={<Profile />} />
          <Route path="/customer/cart/:shopId" element={<Cart />} />
          <Route path="/customer/review/:bookingId" element={<ReviewPage />} />
          <Route path="/customer/refund" element={<RefundPage />} />
          <Route path="/customer/feedback" element={<Feedback />} />
        </Route>

        {/* 理发店端路由 */}
        <Route path="/shop/login" element={<ShopLogin />} />
        <Route element={<ShopRouteGuard />}>
          <Route path="/shop" element={<Dashboard />} />
          <Route path="/shop/manage" element={<ShopManage />} />
          <Route path="/shop/products" element={<ProductManagement />} />
          <Route path="/shop/reviews" element={<ReviewManagement />} />
          <Route path="/shop/stylist" element={<StylistDashboard />} />
          <Route path="/shop/financial" element={<FinancialReport />} />
          <Route path="/shop/owner" element={<OwnerDashboard />} />
          <Route path="/shop/refunds" element={<RefundManagement />} />
          <Route path="/shop/customers" element={<CustomerManagement />} />
          <Route path="/shop/customers-table" element={<CustomerTableManagement />} />
          <Route path="/shop/bookings" element={<BookingManagement />} />
          <Route path="/shop/checkout" element={<Checkout />} />
          <Route path="/shop/settlement" element={<SettlementManagement />} />
          <Route path="/shop/membership" element={<MembershipManagement />} />
          <Route path="/shop/survey" element={<SatisfactionSurveyManagement />} />
          <Route path="/shop/review-management" element={<ReviewManagement />} />
          <Route path="/shop/customer-profile" element={<CustomerManagement />} />
          <Route path="/shop/customer-profile/:customerId" element={<CustomerProfileForm />} />
          <Route path="/shop/customer-recall" element={<CustomerRecall />} />
        </Route>

        {/* 店铺专属入口（保留短链，但移除 /shop/:shopId 通配，避免误匹配管理端路径） */}
        <Route path="/s/:shopId" element={<ShopRedirect />} />
      </Routes>
    </Router>
  );
}
