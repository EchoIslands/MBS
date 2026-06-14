import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from "react-router-dom";

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
import SettlementManagement from "./pages/shop/SettlementManagement";
import MembershipManagement from "./pages/shop/MembershipManagement";
import SatisfactionSurveyManagement from "./pages/shop/SatisfactionSurveyManagement";
import ReviewManagement from "./pages/shop/ReviewManagement";
import CustomerProfileForm from "./pages/shop/CustomerProfileForm";
import CustomerRecall from "./pages/shop/CustomerRecall";
import BookingManagement from "./pages/shop/BookingManagement";

// 默认店铺ID
const DEFAULT_SHOP_ID = "shop1";

// 店铺专属入口重定向组件
const ShopRedirect = () => {
  const { shopId } = useParams<{ shopId: string }>();
  return <Navigate to={`/customer/shop/${shopId || DEFAULT_SHOP_ID}`} replace />;
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

        {/* 理发店端路由 */}
        <Route path="/shop/login" element={<ShopLogin />} />
        <Route path="/shop" element={<Dashboard />} />
        <Route path="/shop/manage" element={<ShopManage />} />
        <Route path="/shop/products" element={<ProductManagement />} />
        <Route path="/shop/reviews" element={<ReviewsManagement />} />
        <Route path="/shop/stylist" element={<StylistDashboard />} />
        <Route path="/shop/financial" element={<FinancialReport />} />
        <Route path="/shop/owner" element={<OwnerDashboard />} />
        <Route path="/shop/refunds" element={<RefundManagement />} />
        <Route path="/shop/customers" element={<CustomerManagement />} />
        <Route path="/shop/bookings" element={<BookingManagement />} />
        <Route path="/shop/settlement" element={<SettlementManagement />} />
        <Route path="/shop/membership" element={<MembershipManagement />} />
        <Route path="/shop/survey" element={<SatisfactionSurveyManagement />} />
        <Route path="/shop/review-management" element={<ReviewManagement />} />
        <Route path="/shop/customer-profile/:customerId" element={<CustomerProfileForm />} />
        <Route path="/shop/customer-recall" element={<CustomerRecall />} />

        {/* 店铺专属入口 */}
        <Route path="/s/:shopId" element={<ShopRedirect />} />
        <Route path="/shop/:shopId" element={<ShopRedirect />} />
      </Routes>
    </Router>
  );
}
