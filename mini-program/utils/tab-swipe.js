const TAB_PATHS = [
  '/pages/index/index',
  '/pages/products/products',
  '/pages/booking/booking',
  '/pages/profile/profile',
];
let pendingTransition = null;

function tabSwipeBlocked(data) {
  return !!(data?.viewingBooking || data?.rescheduleTarget || data?.showLogin || data?.showCoupons ||
    data?.selectedStylist || data?.editVisible || data?.editSaving || data?.editAvatarUploading || data?.booking);
}

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

// 横向滚动区用 bindtouchstart 标记本次手势，不拦截原生滚动或点击。
export function createTabSwipeHandlers(tabIndex) {
  return {
    onTabSwipeStart(event) {
      const ignored = this._ignoreTabSwipe;
      this._ignoreTabSwipe = false;
      if (ignored || tabSwipeBlocked(this.data)) {
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
      if (!start || !touch || tabSwipeBlocked(this.data)) return;
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

    ignoreTabSwipe() {
      this._tabSwipeStart = null;
      this._ignoreTabSwipe = true;
    },
  };
}
