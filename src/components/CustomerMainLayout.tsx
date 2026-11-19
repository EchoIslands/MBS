import { useEffect, useRef, type TouchEvent } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import storeIcon from '../../mini-program/assets/tabbar/store.png';
import storeActive from '../../mini-program/assets/tabbar/store-active.png';
import shopIcon from '../../mini-program/assets/tabbar/shop.png';
import shopActive from '../../mini-program/assets/tabbar/shop-active.png';
import bookIcon from '../../mini-program/assets/tabbar/booking.png';
import bookActive from '../../mini-program/assets/tabbar/booking-active.png';
import meIcon from '../../mini-program/assets/tabbar/me.png';
import meActive from '../../mini-program/assets/tabbar/me-active.png';

const tabs = [
  { label: '门店', icon: storeIcon, active: storeActive, path: (id: string) => '/customer/shop/' + id },
  { label: '商城', icon: shopIcon, active: shopActive, path: (id: string) => '/customer/products/' + id },
  { label: '预约', icon: bookIcon, active: bookActive, path: (id: string) => '/customer/booking/' + id },
  { label: '我的', icon: meIcon, active: meActive, path: () => '/customer/profile' },
];

export default function CustomerMainLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const currentCustomer = useAppStore(state => state.currentCustomer);
  const routeShopId = pathname.match(/^\/customer\/(?:shop|products|booking)\/([^/]+)/)?.[1];
  const shopId = routeShopId || currentCustomer?.shopId || 'shop1';
  const selected = pathname.startsWith('/customer/products/') ? 1
    : pathname.startsWith('/customer/booking/') ? 2
    : pathname === '/customer/profile' ? 3 : 0;
  const panel = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; at: number; dragged: boolean } | null>(null);
  const direction = useRef(0);
  const timer = useRef<number>();
  const scrollPositions = useRef(new Map<string, number>());

  useEffect(() => {
    const el = panel.current;
    const enter = direction.current;
    direction.current = 0;
    if (el) {
      el.style.transform = '';
      const position = scrollPositions.current.get(pathname) ?? 0;
      window.scrollTo(0, position);
      if (enter && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.animate([{ transform: 'translateX(' + (enter * 30) + '%)' }, { transform: 'translateX(0)' }], { duration: 300, easing: 'ease-out' });
      }
    }
    return () => window.clearTimeout(timer.current);
  }, [pathname]);

  const switchTab = (next: number, swipe = false) => {
    if (next === selected) return;
    window.clearTimeout(timer.current);
    scrollPositions.current.set(pathname, window.scrollY);
    direction.current = swipe ? Math.sign(next - selected) : 0;
    navigate(tabs[next].path(shopId), { replace: true });
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touch.current = null;
    const target = event.target;
    if (event.touches.length !== 1 || (target instanceof Element && target.closest('input,textarea,select,button,a,[data-no-tab-swipe],[role=dialog]'))) return;
    touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, at: Date.now(), dragged: false };
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const start = touch.current;
    if (!start || !panel.current || event.touches.length !== 1) return;
    const dx = event.touches[0].clientX - start.x;
    const dy = event.touches[0].clientY - start.y;
    if (!start.dragged && (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.5)) return;
    const next = selected + (dx < 0 ? 1 : -1);
    const limit = panel.current.clientWidth * .32;
    const offset = dx * (next < 0 || next >= tabs.length ? .12 : .5);
    start.dragged = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    panel.current.style.transform = 'translateX(' + Math.max(-limit, Math.min(limit, offset)) + 'px)';
  };

  const endSwipe = (event?: TouchEvent<HTMLDivElement>) => {
    const start = touch.current;
    touch.current = null;
    const end = event?.changedTouches[0];
    const el = panel.current;
    if (!start || !el) return;
    const dx = end ? end.clientX - start.x : 0;
    const dy = end ? end.clientY - start.y : 0;
    const next = selected + (dx < 0 ? 1 : -1);
    const slide = Math.abs(dx) >= 80 && Math.abs(dx) >= Math.abs(dy) * 1.5 && Date.now() - start.at <= 850
      && next >= 0 && next < tabs.length;
    const offset = el.style.transform || 'translateX(0)';
    el.style.transform = '';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion && (slide || start.dragged)) {
      const transform = slide ? 'translateX(' + (dx < 0 ? -40 : 40) + '%)' : 'translateX(0)';
      el.animate([{ transform: offset }, { transform }], { duration: slide ? 110 : 180, easing: 'ease-out' });
    }
    if (slide) timer.current = window.setTimeout(() => switchTab(next, true), reduceMotion ? 0 : 110);
  };

  return <div className="customer-main">
    <div className="customer-swipe-viewport" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={endSwipe} onTouchCancel={() => endSwipe()}>
      <div ref={panel}><Outlet /></div>
    </div>
    <nav aria-label="顾客主导航" className="customer-tabbar">
      <div className="flex">
        {tabs.map((tab, index) => <button key={tab.label} type="button" aria-current={selected === index ? 'page' : undefined} onClick={() => switchTab(index)}
          className={'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[13px] font-semibold ' + (selected === index || index === 2 ? 'text-[#a8582f]' : 'text-[#71665d]')}>
          <img src={index === selected ? tab.active : tab.icon} alt="" width={index === 2 ? 29 : 26} height={index === 2 ? 29 : 26} />
          <span className="leading-tight">{tab.label}</span>
        </button>)}
      </div>
    </nav>
  </div>;
}
