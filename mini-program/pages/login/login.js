import { loginCustomer } from '../../api/customer';
import { getCustomerId, setCustomerId, getToken, clearCustomerId } from '../../utils/storage';
import { restoreCustomerSession } from '../../api/customer';
import { paymentOrderNumber, paymentOrderPath } from '../../utils/payment-order-link';

Page({
  data: {
    password: '',
    confirmPassword: '',
    showPassword: false,
    showConfirmPassword: false,
    setupRequired: false,
    phone: '',
    loggingIn: false,
    restoringSession: false,
    error: '',
  },

  async onLoad(options = {}) {
    this.inviteRef = options.inviteRef || '';
    this.returnOrderNo = paymentOrderNumber(options);
    if (options.reason === 'session_expired') {
      this.setData({ error: '登录凭证已失效，请重新登录' });
    }
    const cachedId = getCustomerId();
    const cachedToken = getToken();
    if (cachedId && cachedToken) {
      this.setData({ restoringSession: true });
      try {
        const customer = await restoreCustomerSession();
        if (getCustomerId() !== cachedId || getToken() !== cachedToken) return;
        if (customer) { wx.reLaunch({ url: this.afterLoginPath(customer) }); return; }
        clearCustomerId();
      } catch (err) {
        if (err.statusCode === 401) {
          if (getCustomerId() === cachedId && getToken() === cachedToken) clearCustomerId();
          this.setData({ error: '登录凭证已失效，请重新登录' });
        } else {
          this.setData({ error: err.message || '自动登录暂不可用，请检查网络后重试或重新登录' });
        }
      } finally {
        this.setData({ restoringSession: false });
      }
    } else if (cachedId || cachedToken) {
      clearCustomerId();
    }
  },

  onHide() {
    this.setData({ showPassword: false, showConfirmPassword: false });
  },

  afterLoginPath(customer) {
    if (customer.mustChangePassword) return '/pages/change-password/change-password' + (this.returnOrderNo ? '?returnOrderNo=' + this.returnOrderNo : '');
    return paymentOrderPath(this.returnOrderNo) || (this.inviteRef ? '/pages/invite/claim?ref='+encodeURIComponent(this.inviteRef) : '/pages/index/index');
  },

  togglePasswordVisibility() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  toggleConfirmPasswordVisibility() {
    this.setData({ showConfirmPassword: !this.data.showConfirmPassword });
  },

  onPasswordInput(e) { this.setData({ password: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6), error: '' }); },
  onConfirmPasswordInput(e) { this.setData({ confirmPassword: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6), error: '' }); },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value, error: '' });
  },

  async onLogin() {
    if(this.data.loggingIn || this.data.restoringSession) return;
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
      if (result.setupRequired) { this.setData({ setupRequired: true, password: '', confirmPassword: '', showPassword: false, showConfirmPassword: false }); return; }
      const customer = result.customer;
      if (customer && customer.id) {
        setCustomerId(customer.id);
        wx.showToast({ title: '登录成功', icon: 'success' });
        wx.reLaunch({ url: this.afterLoginPath(customer) });
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
