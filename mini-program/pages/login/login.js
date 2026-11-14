import { loginCustomer, loginCustomerWithSms, sendCustomerSmsCode } from '../../api/customer';
import { getCustomerId, setCustomerId, getToken, clearCustomerId } from '../../utils/storage';
import { restoreCustomerSession } from '../../api/customer';
import { paymentOrderNumber, paymentOrderPath } from '../../utils/payment-order-link';

const REMEMBERED_PHONE_KEY = 'mbs_customer_login_phone';

Page({
  data: {
    loginMode: 'password',
    smsCode: '',
    smsSending: false,
    smsSeconds: 0,
    password: '',
    confirmPassword: '',
    showPassword: false,
    showConfirmPassword: false,
    setupRequired: false,
    phone: '',
    rememberPhone: true,
    loggingIn: false,
    restoringSession: false,
    error: '',
  },

  async onLoad(options = {}) {
    const remembered = wx.getStorageSync(REMEMBERED_PHONE_KEY);
    if (typeof remembered === 'string' && /^1[3-9]\d{9}$/.test(remembered)) this.setData({ phone: remembered });
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

  onUnload() { if (this.smsTimer) clearInterval(this.smsTimer); },

  onShow() { this.fillSmsCodeFromClipboard(); },

  onSmsCodeFocus() { this.fillSmsCodeFromClipboard(); },

  onPasteSmsCode() { this.fillSmsCodeFromClipboard(true); },

  fillSmsCodeFromClipboard(manual = false) {
    if (this.data.loginMode !== 'sms' || this.data.loggingIn || this.clipboardReading) return;
    if (!manual && (this.data.smsCode || this.smsRequestedPhone !== this.data.phone || Date.now() - this.smsRequestedAt > 5 * 60 * 1000)) return;
    const phone = this.data.phone;
    const previousCode = this.data.smsCode;
    const requestedAt = this.smsRequestedAt;
    if (typeof wx.getClipboardData !== 'function') return;
    this.clipboardReading = true;
    wx.getClipboardData({
      success: ({ data }) => {
        // A late clipboard response must not overwrite typing or a different phone/request.
        if (this.data.loginMode !== 'sms' || this.data.loggingIn || this.data.phone !== phone || this.data.smsCode !== previousCode || this.smsRequestedAt !== requestedAt) return;
        const code = String(data || '').trim();
        if (/^\d{6}$/.test(code)) this.setData({ smsCode: code, error: '' });
        else if (manual) wx.showToast({ title: '请先复制六位短信验证码', icon: 'none' });
      },
      fail: () => { if (manual) wx.showToast({ title: '无法读取，请长按输入框粘贴', icon: 'none' }); },
      complete: () => { this.clipboardReading = false; },
    });
  },

  onHide() {
    this.setData({ showPassword: false, showConfirmPassword: false });
  },

  afterLoginPath(customer) {
    if (customer.mustChangePassword) return '/pages/change-password/change-password' + (this.returnOrderNo ? '?returnOrderNo=' + this.returnOrderNo : '') + (this.inviteRef ? (this.returnOrderNo ? '&' : '?') + 'inviteRef=' + encodeURIComponent(this.inviteRef) : '');
    return paymentOrderPath(this.returnOrderNo) || (this.inviteRef ? '/pages/invite/claim?ref='+encodeURIComponent(this.inviteRef) : '/pages/index/index');
  },

  togglePasswordVisibility() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  toggleConfirmPasswordVisibility() {
    this.setData({ showConfirmPassword: !this.data.showConfirmPassword });
  },

  setLoginMode(e) {
    const loginMode = e.currentTarget.dataset.mode;
    if (loginMode !== 'password' && loginMode !== 'sms') return;
    this.setData({ loginMode, error: '', password: '', confirmPassword: '', smsCode: '', setupRequired: false });
  },

  onSmsCodeInput(e) { this.setData({ smsCode: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6), error: '' }); },

  async onSendSmsCode() {
    if (this.data.smsSending || this.data.smsSeconds > 0 || this.data.loggingIn) return;
    const phone = this.data.phone.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) { this.setData({ error: '请输入正确的手机号' }); return; }
    this.setData({ smsSending: true, error: '' });
    try {
      const result = await sendCustomerSmsCode(phone);
      this.smsRequestedPhone = phone;
      this.smsRequestedAt = Date.now();
      this.setData({ error: '', smsSeconds: 60 });
      wx.showToast({ title: result.message || '验证码已发送', icon: 'none' });
      if (this.smsTimer) clearInterval(this.smsTimer);
      this.smsTimer = setInterval(() => {
        const remaining = this.data.smsSeconds - 1;
        this.setData({ smsSeconds: Math.max(0, remaining) });
        if (remaining <= 0) { clearInterval(this.smsTimer); this.smsTimer = null; }
      }, 1000);
    } catch (err) { this.setData({ error: err.message || '发送失败，请稍后重试' }); }
    finally { this.setData({ smsSending: false }); }
  },

  onPasswordInput(e) { this.setData({ password: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6), error: '' }); },
  onConfirmPasswordInput(e) { this.setData({ confirmPassword: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6), error: '' }); },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value, setupRequired: false, password: '', confirmPassword: '', smsCode: '', error: '' });
  },

  onRememberPhoneChange(e) {
    const rememberPhone = e.detail.value.length > 0;
    this.setData({ rememberPhone });
    if (!rememberPhone) wx.removeStorageSync(REMEMBERED_PHONE_KEY);
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
      if (this.data.loginMode === 'sms' && !/^\d{6}$/.test(this.data.smsCode)) throw new Error('请输入六位短信验证码');
      if (this.data.loginMode === 'password' && this.data.password && !/^\d{6}$/.test(this.data.password)) throw new Error('密码必须为六位数字');
      if (this.data.setupRequired && this.data.password !== this.data.confirmPassword) throw new Error('两次输入的密码不一致');
      const result = this.data.loginMode === 'sms'
        ? { customer: await loginCustomerWithSms(phone.trim(), this.data.smsCode) }
        : await loginCustomer(phone.trim(), this.data.password, this.data.setupRequired);
      if (result.setupRequired) { this.setData({ setupRequired: true, password: '', confirmPassword: '', showPassword: false, showConfirmPassword: false }); return; }
      const customer = result.customer;
      if (customer && customer.id) {
        if (this.data.rememberPhone) wx.setStorageSync(REMEMBERED_PHONE_KEY, phone.trim());
        else wx.removeStorageSync(REMEMBERED_PHONE_KEY);
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
