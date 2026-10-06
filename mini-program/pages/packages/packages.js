import { get } from '../../utils/api';
import { getCustomerId } from '../../utils/storage';
import { ensureLogin } from '../../utils/auth';

function formatDate(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function statusLabel(status) {
  const map = { active: '有效', used_up: '已用完', expired: '已过期' };
  return map[status] || status;
}

Page({
  data: {
    packages: [],
    loading: true,
    error: '',
    notLoggedIn: false,
  },

  async onLoad(options) {
    this.routeCustomerId = (options && options.customerId) || '';
    this.shopId = (options && options.shopId) || 'shop1';
    await this.loadPackages();
  },

  async loadPackages() {
    const customerId = getCustomerId() || this.routeCustomerId;
    const shopId = this.shopId || 'shop1';

    if (!customerId) {
      this.setData({ loading: false, error: '', notLoggedIn: true });
      ensureLogin({ content: '登录后即可查看你的次卡' });
      return;
    }

    this.setData({ loading: true, error: '', notLoggedIn: false });
    try {
      const res = await get(`/customers/${customerId}/packages?shopId=${shopId}`);
      if (res && res.success) {
        this.setData({
          packages: (res.data || []).map((p) => ({
            ...p,
            expiresAtText: formatDate(p.expiresAt),
            statusText: statusLabel(p.status),
            remaining: Math.max(0, (p.totalTimes || 0) - (p.usedTimes || 0)),
          })),
          loading: false,
        });
      } else {
        throw new Error((res && res.error) || '加载失败');
      }
    } catch (err) {
      console.error('[packages] 加载次卡失败:', err);
      if (err.statusCode === 401) {
        this.setData({ loading: false, notLoggedIn: true, error: '' });
        ensureLogin({ content: '登录后即可查看你的次卡' });
        return;
      }
      this.setData({ error: err.message || '加载失败', loading: false });
    }
  },

  reload() {
    this.loadPackages();
  },

  goToLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  onPullDownRefresh() {
    this.loadPackages().finally(() => wx.stopPullDownRefresh());
  },

  goToBooking() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
