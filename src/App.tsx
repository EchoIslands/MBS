import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

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

// 理发店端
import ShopLogin from "./pages/shop/Login";
import Dashboard from "./pages/shop/Dashboard";
import ShopManage from "./pages/shop/Manage";
import ReviewsManagement from "./pages/shop/Reviews";

export default function App() {
  return (
    <Router>
      <Routes>
        {/* 角色选择 */}
        <Route path="/" element={<SelectRole />} />

        {/* 顾客端路由 */}
        <Route path="/customer/login" element={<CustomerLogin />} />
        <Route path="/customer" element={<CustomerHome />} />
        <Route path="/customer/shop/:id" element={<ShopDetail />} />
        <Route path="/customer/booking/:shopId" element={<Booking />} />
        <Route path="/customer/queue/:bookingId" element={<Queue />} />
        <Route path="/customer/profile" element={<Profile />} />
        <Route path="/customer/review/:bookingId" element={<ReviewPage />} />

        {/* 理发店端路由 */}
        <Route path="/shop/login" element={<ShopLogin />} />
        <Route path="/shop" element={<Dashboard />} />
        <Route path="/shop/manage" element={<ShopManage />} />
        <Route path="/shop/reviews" element={<ReviewsManagement />} />
      </Routes>
    </Router>
  );
}
