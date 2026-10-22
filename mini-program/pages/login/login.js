import { loginCustomer } from '../../api/customer';
import { getCustomerId, setCustomerId, getToken, clearCustomerId } from '../../utils/storage';
import { restoreCustomerSession } from '../../api/customer';

Page({
  data: {
    password: '',
    confirmPassword: '',
    setupRequired: false,
    phone: '',
    loggingIn: false,
    error: '',
  },

  async onLoad(options = {}) {
    this.inviteRef = options.inviteRef || '';
    if (getCustomerId() && getToken()) {
      try {
        const customer = await restoreCustomerSession();
        if (customer) { wx.reLaunch({ url: customer.mustChangePassword ? '/pages/change-password/change-password' : this.inviteRef ? '/pages/invite/claim?ref='+encodeURIComponent(this.inviteRef) : '/pages/index/index' }); return; }
      } catch {}
      clearCustomerId();
    }
  },

  onPasswordInput(e) { this.setData({ password: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6), error: '' }); },
  onConfirmPasswordInput(e) { this.setData({ confirmPassword: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6), error: '' }); },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value, error: '' });
  },

  async onLogin() {
    if(this.data.loggingIn) return;
    const { phone } = this.data;
    if (!phone || !/^1\d{10}$/.test(phone)) {
      this.setData({ error: '请输入正确的手机号' });
      return;
    }

    this.setData({ loggingIn: true, error: '' });
    try {
      if (this.data.password && !/^\d{6}$/.test(this.data.password)) throw new Error('密码必须为六位数字');
      if (this.data.setupRequired && this.data.password !== this.data.confirmPassword) throw new Error('两次输入的密码不一致');
      const result = await loginCustomer(phone.trim(), this.data.password, this.data.setupRequired);
      if (result.setupRequired) { this.setData({ setupRequired: true, password: '', confirmPassword: '' }); return; }
      const customer = result.customer;
      if (customer && customer.id) {
        setCustomerId(customer.id);
        wx.showToast({ title: '登录成功', icon: 'success' });
        wx.reLaunch({ url: customer.mustChangePassword ? '/pages/change-password/change-password' : this.inviteRef ? '/pages/invite/claim?ref='+encodeURIComponent(this.inviteRef) : '/pages/index/index' });
      } else {
        this.setData({ error: '登录失败，请检查手机号' });
      }
    } catch (err) {
      this.setData({ error: err.message || '登录失败，请稍后重试' });
    } finally {
      this.setData({ loggingIn: false });
    }
  },
});
