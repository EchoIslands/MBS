import { changeCustomerPassword } from '../../api/customer';
import { getCustomerId, getToken, clearCustomerId } from '../../utils/storage';
Page({
  data: { currentPassword: '', newPassword: '', confirmPassword: '', saving: false, error: '' },
  onLoad() { if (!getCustomerId() || !getToken()) wx.reLaunch({ url: '/pages/login/login' }); },
  onShow() { if (wx.hideHomeButton) wx.hideHomeButton(); },
  onInput(e) { this.setData({ [e.currentTarget.dataset.field]: String(e.detail.value || '').replace(/[^0-9]/g, '').slice(0, 6), error: '' }); },
  async onSubmit() {
    if (this.data.saving) return;
    const { currentPassword, newPassword, confirmPassword } = this.data;
    if (!/^[0-9]{6}$/.test(currentPassword) || !/^[0-9]{6}$/.test(newPassword) || newPassword !== confirmPassword || newPassword === '123456' || newPassword === currentPassword) {
      this.setData({ error: '请填写原密码，并设置不同于原密码及 123456 的六位数字密码，两次输入须一致' }); return;
    }
    this.setData({ saving: true, error: '' });
    try {
      await changeCustomerPassword(currentPassword, newPassword, confirmPassword);
      this.setData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      wx.reLaunch({ url: '/pages/index/index' });
    } catch (err) { this.setData({ error: err.message || '修改失败，请重试' }); }
    finally { this.setData({ saving: false }); }
  },
  onLogout() { clearCustomerId(); wx.reLaunch({ url: '/pages/login/login' }); }
});
