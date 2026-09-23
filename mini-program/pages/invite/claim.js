import { checkInviteCode, claimReferralCoupon } from '../../api/referral';
import { setCustomerId } from '../../utils/storage';

Page({
  data: {
    ref: '',
    loading: true,
    error: '',
    referrerName: '会员',
    coupon: null,
    alreadyClaimed: false,
    phone: '',
    name: '',
    claiming: false,
    claimed: false,
    claimedCoupon: null,
  },

  async onLoad(options) {
    const ref = options.ref || options.scene;
    if (!ref) {
      this.setData({ loading: false, error: '无效的邀请链接' });
      return;
    }
    this.setData({ ref });
    await this.loadInviteInfo();
  },

  async loadInviteInfo() {
    try {
      this.setData({ loading: true, error: '' });
      const res = await checkInviteCode(this.data.ref);
      if (res.success) {
        this.setData({
          referrerName: res.data.referrerName || '会员',
          coupon: res.data.coupon,
          alreadyClaimed: res.data.alreadyClaimed,
          loading: false,
        });
      } else {
        this.setData({ loading: false, error: res.error || '邀请信息加载失败' });
      }
    } catch (err) {
      this.setData({ loading: false, error: err.message || '邀请信息加载失败' });
    }
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  async onClaim() {
    const { ref, phone, name, alreadyClaimed, claiming } = this.data;
    if (alreadyClaimed || claiming) return;

    if (!phone || !/^1[3-9]\d{9}$/.test(phone.trim())) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return;
    }

    try {
      this.setData({ claiming: true });
      const res = await claimReferralCoupon(ref, phone.trim(), name.trim());
      if (res.success) {
        setCustomerId(res.data.customerId);
        this.setData({
          claimed: true,
          claiming: false,
          claimedCoupon: res.data,
        });
        wx.showToast({ title: '领取成功', icon: 'success' });
      } else {
        wx.showToast({ title: res.error || '领取失败', icon: 'none' });
        this.setData({ claiming: false });
      }
    } catch (err) {
      wx.showToast({ title: err.message || '领取失败', icon: 'none' });
      this.setData({ claiming: false });
    }
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
