import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useEffect } from 'react';
import { useAppStore } from "./store";

// 角色选择
import SelectRole from "./pages/SelectRole";

// 顾客端
import CustomerLogin from "./pages/customer/Login";
import CustomerHome from "./pages/customer/Home";
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
import ReviewsManagement from "./pages/shop/Reviews";
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

// 默认店铺ID
const DEFAULT_SHOP_ID = "shop1";

// 理发店端路由守卫：未登录时重定向到 /shop/login
const ShopRouteGuard = () => {
  const { currentShop, currentEmployee } = useAppStore();
  const location = useLocation();
  if (!currentShop && !currentEmployee && location.pathname !== "/shop/login") {
    return <Navigate to="/shop/login" replace />;
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
        <Route path="/customer/cart/:shopId" element={<Cart />} />
        <Route path="/customer/booking/:shopId" element={<Booking />} />
        <Route path="/customer/queue/:bookingId" element={<Queue />} />
        <Route path="/customer/profile" element={<Profile />} />
        <Route path="/customer/review/:bookingId" element={<ReviewPage />} />
        <Route path="/customer/refund" element={<RefundPage />} />
        <Route path="/customer/feedback" element={<Feedback />} />

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
