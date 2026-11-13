const tabs = [
  { pagePath: '/pages/index/index', text: '门店', icon: '/assets/tabbar/store.png', selectedIcon: '/assets/tabbar/store-active.png' },
  { pagePath: '/pages/products/products', text: '商城', icon: '/assets/tabbar/shop.png', selectedIcon: '/assets/tabbar/shop-active.png' },
  { pagePath: '/pages/booking/booking', text: '预约', icon: '/assets/tabbar/booking.png', selectedIcon: '/assets/tabbar/booking-active.png' },
  { pagePath: '/pages/profile/profile', text: '我的', icon: '/assets/tabbar/me.png', selectedIcon: '/assets/tabbar/me-active.png' },
];

Component({
  data: { selected: 0, tabs },
  attached() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
    const route = pages[pages.length - 1]?.route;
    const index = tabs.findIndex((tab) => tab.pagePath.slice(1) === route);
    if (index >= 0) this.setData({ selected: index });
  },
  methods: {
    onSelect(event) {
      const index = Number(event.currentTarget.dataset.index);
      const tab = tabs[index];
      if (!tab || index === this.data.selected) return;
      wx.switchTab({ url: tab.pagePath });
    },
  },
});
