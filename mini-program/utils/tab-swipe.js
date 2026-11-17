const TAB_PATHS = [
  '/pages/index/index',
  '/pages/products/products',
  '/pages/booking/booking',
  '/pages/profile/profile',
];
let pendingTransition = null;

function animatePage(page, x, duration) {
  if (typeof wx.createAnimation !== 'function' || typeof page.setData !== 'function') return false;
  const animation = wx.createAnimation({ duration, timingFunction: 'ease-out' });
  animation.translateX(x).step();
  page.setData({ tabSwipeAnimation: animation.export() });
  return true;
}

function windowWidth() {
  return typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo().windowWidth : 375;
}

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
  const entering = transition?.index === index;
  const nativeAnimation = entering && animatePage(page, transition.direction * windowWidth() * 0.3, 0);
  page.setData({ tabTransitionClass: entering && !nativeAnimation ? transition.className : '' });
  if (entering) {
    page._tabTransitionTimer = setTimeout(() => {
      if (nativeAnimation) animatePage(page, 0, 300);
      else page.setData({ tabTransitionClass: '' });
    }, nativeAnimation ? 20 : 320);
  }
}

// 横向滚动区用 bindtouchstart 标记本次手势，不拦截原生滚动或点击。
export function createTabSwipeHandlers(tabIndex) {
  return {
    onTabSwipeStart(event) {
      if (this._tabSwitching) return;
      this._tabDragActive = false;
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

    onTabSwipeMove(event) {
      const start = this._tabSwipeStart;
      const touch = event.touches?.[0];
      if (!start || !touch || this._tabSwitching || tabSwipeBlocked(this.data)) return;
      const dx = touch.pageX - start.x;
      const dy = touch.pageY - start.y;
      if (!this._tabDragActive && (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.5)) return;
      if (Date.now() - (this._tabMoveAt || 0) < 32) return;
      this._tabMoveAt = Date.now();
      this._tabDragActive = true;
      const next = tabIndex + (dx < 0 ? 1 : -1);
      const resistance = next < 0 || next >= TAB_PATHS.length ? 0.12 : 0.5;
      const limit = windowWidth() * 0.32;
      animatePage(this, Math.max(-limit, Math.min(limit, dx * resistance)), 0);
    },

    onTabSwipeEnd(event) {
      const start = this._tabSwipeStart;
      this._tabSwipeStart = null;
      const touch = event.changedTouches && event.changedTouches[0];
      if (!start || !touch || tabSwipeBlocked(this.data)) {
        if (this._tabDragActive) animatePage(this, 0, 180);
        return;
      }
      const dx = touch.pageX - start.x;
      const dy = touch.pageY - start.y;
      if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - start.time > 850) {
        if (this._tabDragActive) animatePage(this, 0, 180);
        return;
      }
      const next = tabIndex + (dx < 0 ? 1 : -1);
      if (next < 0 || next >= TAB_PATHS.length) { animatePage(this, 0, 180); return; }
      if (this._tabSwitching) return;
      this._tabSwitching = true;
      const switchPage = () => {
        this._tabSwitchTimer = null;
        pendingTransition = { index: next, direction: dx < 0 ? 1 : -1, className: dx < 0 ? 'tab-enter-right' : 'tab-enter-left' };
        wx.switchTab({ url: TAB_PATHS[next], fail: () => { pendingTransition = null; animatePage(this, 0, 180); }, complete: () => { this._tabSwitching = false; } });
      };
      if (animatePage(this, (dx < 0 ? -1 : 1) * windowWidth() * 0.4, 110)) {
        this._tabSwitchTimer = setTimeout(switchPage, 110);
      } else {
        this._tabSwitching = false;
        switchPage();
      }
    },

    onTabSwipeCancel() {
      this._tabSwipeStart = null;
      if (this._tabDragActive) animatePage(this, 0, 180);
      this._tabDragActive = false;
    },

    onHide() {
      if (this._tabSwitchTimer) clearTimeout(this._tabSwitchTimer);
      if (this._tabTransitionTimer) clearTimeout(this._tabTransitionTimer);
      this._tabSwitching = false;
      this._tabSwipeStart = null;
      this._ignoreTabSwipe = false;
      this._tabDragActive = false;
      animatePage(this, 0, 0);
    },

    onUnload() {
      this.onHide();
    },

    ignoreTabSwipe() {
      this._tabSwipeStart = null;
      this._ignoreTabSwipe = true;
    },
  };
}
