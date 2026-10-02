import { loginCustomer } from '../../api/customer';
import { getCustomerId, setCustomerId } from '../../utils/storage';

Page({
  data: {
    phone: '',
    name: '',
    loggingIn: false,
    error: '',
  },

  onLoad() {
    // 已登录直接进首页
    if (getCustomerId()) {
      wx.reLaunch({ url: '/pages/index/index' });
    }
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value, error: '' });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value, error: '' });
  },

  async onLogin() {
    const { phone, name } = this.data;
    if (!phone || !/^1\d{10}$/.test(phone)) {
      this.setData({ error: '请输入正确的手机号' });
      return;
    }

    this.setData({ loggingIn: true, error: '' });
    try {
      const customer = await loginCustomer(phone.trim(), name.trim());
      if (customer && customer.id) {
        setCustomerId(customer.id);
        wx.showToast({ title: '登录成功', icon: 'success' });
        wx.reLaunch({ url: '/pages/index/index' });
      } else {
        this.setData({ error: '登录失败，请检查手机号' });
      }
    } catch (err) {
      console.error('[login] 登录失败:', err);
      this.setData({ error: err.message || '登录失败，请稍后重试' });
    } finally {
      this.setData({ loggingIn: false });
    }
  },
});
