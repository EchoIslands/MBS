const TAB_PATHS = [
  '/pages/index/index',
  '/pages/products/products',
  '/pages/booking/booking',
  '/pages/profile/profile',
];
let pendingTransition = null;

export function syncTabBarSelected(page, index) {
  const tabBar = typeof page.getTabBar === 'function' ? page.getTabBar() : null;
  if (tabBar && tabBar.data?.selected !== index) tabBar.setData({ selected: index });
  if (page._tabTransitionTimer) clearTimeout(page._tabTransitionTimer);
  const transition = pendingTransition;
  pendingTransition = null;
  page.setData({ tabTransitionClass: transition?.index === index ? transition.className : '' });
  if (transition?.index === index) {
    page._tabTransitionTimer = setTimeout(() => page.setData({ tabTransitionClass: '' }), 240);
  }
}

// 只识别明确的横向手势。轮播图和横向滚动区在 WXML 中拦截 touchstart。
export function createTabSwipeHandlers(tabIndex) {
  return {
    onTabSwipeStart(event) {
      if (this.data?.viewingBooking || this.data?.rescheduleTarget || this.data?.showLogin || this.data?.showCoupons || this.data?.selectedStylist) {
        this._tabSwipeStart = null;
        return;
      }
      const touch = event.touches && event.touches[0];
      this._tabSwipeStart = touch
        ? { x: touch.pageX, y: touch.pageY, time: Date.now() }
        : null;
    },

    onTabSwipeEnd(event) {
      const start = this._tabSwipeStart;
      this._tabSwipeStart = null;
      const touch = event.changedTouches && event.changedTouches[0];
      if (!start || !touch) return;
      const dx = touch.pageX - start.x;
      const dy = touch.pageY - start.y;
      if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - start.time > 850) return;
      const next = tabIndex + (dx < 0 ? 1 : -1);
      if (next < 0 || next >= TAB_PATHS.length) return;
      pendingTransition = { index: next, className: dx < 0 ? 'tab-enter-right' : 'tab-enter-left' };
      wx.switchTab({ url: TAB_PATHS[next], fail: () => { pendingTransition = null; } });
    },

    onTabSwipeCancel() {
      this._tabSwipeStart = null;
    },

    ignoreTabSwipe() {},
  };
}
