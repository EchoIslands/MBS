import { useRef, type TouchEvent } from 'react';
import { CalendarDays, Store, ShoppingBag, UserRound } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';

const tabs = [
  { label: '门店', icon: Store, path: (id: string) => `/customer/shop/${id}` },
  { label: '商城', icon: ShoppingBag, path: (id: string) => `/customer/products/${id}` },
  { label: '预约', icon: CalendarDays, path: (id: string) => `/customer/booking/${id}` },
  { label: '我的', icon: UserRound, path: () => '/customer/profile' },
];

export default function CustomerMainLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const currentShop = useAppStore(state => state.currentShop);
  const currentCustomer = useAppStore(state => state.currentCustomer);
  const touchStart = useRef<{ x: number; y: number; at: number } | null>(null);
  const routeShopId = pathname.match(/^\/customer\/(?:shop|products|booking)\/([^/]+)/)?.[1];
  const shopId = routeShopId || currentShop?.id || currentCustomer?.shopId || 'shop1';
  const selected = pathname.startsWith('/customer/products/') ? 1
    : pathname.startsWith('/customer/booking/') ? 2
    : pathname === '/customer/profile' ? 3 : 0;

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const target = event.target;
    if (event.touches.length !== 1 || (target instanceof Element && target.closest('input,textarea,select,button,a,[data-no-tab-swipe],[role=dialog]'))) {
      touchStart.current = null;
      return;
    }
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, at: Date.now() };
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    const end = event.changedTouches[0];
    if (!start || !end) return;
    const dx = end.clientX - start.x;
    const dy = end.clientY - start.y;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - start.at > 850) return;
    const next = selected + (dx < 0 ? 1 : -1);
    if (next >= 0 && next < tabs.length) navigate(tabs[next].path(shopId));
  };

  return (
    <div className="min-h-screen bg-[#fff9f3] pb-[calc(72px+env(safe-area-inset-bottom))]">
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => { touchStart.current = null; }}>
        <Outlet />
      </div>
      <nav aria-label="顾客主导航" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#eadbcf] bg-[#fff9f3] shadow-[0_-4px_16px_rgba(104,69,48,0.07)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex h-[72px] max-w-2xl">
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            return <button key={tab.label} type="button" aria-current={selected === index ? 'page' : undefined} onClick={() => navigate(tab.path(shopId))} className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[13px] font-semibold transition-colors ${selected === index || index === 2 ? 'text-[#a8582f]' : 'text-[#71665d]'}`}>
              <Icon size={index === 2 ? 27 : 25} strokeWidth={selected === index ? 2.3 : 1.9} />
              <span>{tab.label}</span>
            </button>;
          })}
        </div>
      </nav>
    </div>
  );
}
