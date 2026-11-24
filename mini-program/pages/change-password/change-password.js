import { changeCustomerPassword, sendCustomerSmsCode } from '../../api/customer';
import { setCustomerId, clearCustomerId } from '../../utils/storage';
import { paymentOrderNumber, paymentOrderPath } from '../../utils/payment-order-link';

Page({
  data: { phone: '', code: '', newPassword: '', confirmPassword: '', saving: false, sending: false, error: '', notice: '' },
  onLoad(options = {}) {
    this.returnOrderNo = paymentOrderNumber(options);
    this.inviteRef = /^ref_[A-Za-z0-9_]{1,28}$/.test(options.inviteRef || '') && options.inviteRef.length <= 32 ? options.inviteRef : '';
    const remembered = wx.getStorageSync('mbs_customer_login_phone');
    if (typeof remembered === 'string' && /^1[3-9]\d{9}$/.test(remembered)) this.setData({ phone: remembered });
  },
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ...(field === 'phone' ? { code: '', notice: '' } : {}), [field]: String(e.detail.value || '').replace(/[^0-9]/g, '').slice(0, field === 'phone' ? 11 : 6), error: '' });
  },
  async onSendCode() {
    if (this.data.saving || this.data.sending) return;
    if (!/^1[3-9]\d{9}$/.test(this.data.phone)) { this.setData({ error: '请输入正确的手机号' }); return; }
    if (Date.now() < (this.retryAt || 0)) { this.setData({ error: '验证码已发送，请稍后重试' }); return; }
    this.setData({ sending: true, error: '', notice: '' });
    try {
      await sendCustomerSmsCode(this.data.phone);
      this.retryAt = Date.now() + 60000;
      this.setData({ notice: '验证码已发送，请查看短信' });
    } catch (err) { this.setData({ error: err.message || '验证码发送失败' }); }
    finally { this.setData({ sending: false }); }
  },
  async onSubmit() {
    if (this.data.saving || this.data.sending) return;
    const { phone, code, newPassword, confirmPassword } = this.data;
    if (!/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(code) || !/^\d{6}$/.test(newPassword) || newPassword !== confirmPassword || newPassword === '123456' || newPassword === phone.slice(-6)) {
      this.setData({ error: '请填写手机号、验证码及两次相同的六位新密码。请避开 123456 和手机号后六位' }); return;
    }
    this.setData({ saving: true, error: '', notice: '' });
    try {
      const customer = await changeCustomerPassword(phone, code, newPassword, confirmPassword);
      setCustomerId(customer.id);
      this.setData({ code: '', newPassword: '', confirmPassword: '' });
      wx.reLaunch({ url: paymentOrderPath(this.returnOrderNo) || (this.inviteRef ? '/pages/invite/claim?ref=' + encodeURIComponent(this.inviteRef) : '/pages/index/index') });
    } catch (err) { this.setData({ error: err.message || '修改失败，请重试' }); }
    finally { this.setData({ saving: false }); }
  },
  onBackToLogin() {
    clearCustomerId();
    const query = ['mode=sms', this.returnOrderNo ? 'returnOrderNo=' + this.returnOrderNo : '', this.inviteRef ? 'inviteRef=' + encodeURIComponent(this.inviteRef) : ''].filter(Boolean).join('&');
    wx.reLaunch({ url: '/pages/login/login?' + query });
  },
});
