import { getBooking } from '../../api/booking';
import { getCustomerPublic } from '../../api/customer';
import { getReviewByBookingId, createReview } from '../../api/review';
import { getCustomerId, takeRouteParams } from '../../utils/storage';

const STATUS_COMPLETED = 'completed';

Page({
  data: {
    bookingId: '',
    shopId: 'shop1',
    customerId: '',
    booking: null,
    existingReview: null,
    loading: true,
    error: '',
    // 评价表单
    serviceScore: 5,
    stylistScore: 5,
    serviceComment: '',
    stylistComment: '',
    isAwareOfMembershipBenefits: true,
    hasConfirmedAware: false,
    comment: '',
    submitting: false,
    submitted: false,
    // 提交后展示
    avgScore: '5.0',
  },

  onLoad(options) {
    let bookingId = options.bookingId || '';
    // 支持从 routeParams 中读取
    if (!bookingId) {
      const params = takeRouteParams();
      if (params && params.bookingId) bookingId = params.bookingId;
    }
    this.setData({ bookingId });
  },

  async onShow() {
    const customerId = getCustomerId();
    if (!customerId) {
      this.setData({ customerId: '', loading: false, error: '请先登录' });
      return;
    }
    this.setData({ customerId });
    await this.loadBookingAndReview();
  },

  async loadBookingAndReview() {
    const { bookingId } = this.data;
    if (!bookingId) {
      this.setData({ loading: false, error: '缺少预约ID' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const [booking, review] = await Promise.all([
        getBooking(bookingId).catch(() => null),
        getReviewByBookingId(bookingId).catch(() => null),
      ]);
      if (booking && booking.shopId) {
        this.setData({ shopId: booking.shopId });
      }
      this.setData({
        booking,
        existingReview: review,
        loading: false,
      });
    } catch (err) {
      console.error('[review] 加载失败:', err);
      this.setData({ loading: false, error: '加载预约信息失败' });
    }
  },

  // ========== 星级打分：点击星位确定分数 ==========
  onServiceScoreTap(e) {
    const score = Number(e.currentTarget.dataset.score);
    if (!isNaN(score) && score >= 0.5 && score <= 5) {
      this.setData({ serviceScore: score });
    }
  },

  onStylistScoreTap(e) {
    const score = Number(e.currentTarget.dataset.score);
    if (!isNaN(score) && score >= 0.5 && score <= 5) {
      this.setData({ stylistScore: score });
    }
  },

  onServiceCommentInput(e) {
    this.setData({ serviceComment: e.detail.value || '' });
  },

  onStylistCommentInput(e) {
    this.setData({ stylistComment: e.detail.value || '' });
  },

  onCommentInput(e) {
    this.setData({ comment: e.detail.value || '' });
  },

  onSetAware(e) {
    const value = e.currentTarget.dataset.value === 'true';
    this.setData({ isAwareOfMembershipBenefits: value, hasConfirmedAware: true });
  },

  // 内容安全校验
  async checkContentSecurity(content) {
    if (!content || !content.trim()) return true;
    if (!wx.security || !wx.security.msgSecCheck) {
      // 基础库不支持时跳过，避免阻断正常评价
      return true;
    }
    return new Promise((resolve) => {
      wx.security.msgSecCheck({
        content: content.trim(),
        success: (res) => {
          resolve(res && res.result && res.result.suggest === 'risky' ? false : true);
        },
        fail: () => {
          // 校验失败时不阻断，避免误判影响体验
          resolve(true);
        },
      });
    });
  },

  // ========== 提交评价 ==========
  async onSubmit() {
    const {
      booking,
      customerId,
      serviceScore,
      stylistScore,
      serviceComment,
      stylistComment,
      isAwareOfMembershipBenefits,
      comment,
    } = this.data;
    if (!booking || !customerId) {
      wx.showToast({ title: '缺少预约或登录信息', icon: 'none' });
      return;
    }
    if (booking.status !== STATUS_COMPLETED) {
      wx.showToast({ title: '服务完成后才能评价', icon: 'none' });
      return;
    }
    if (!this.data.hasConfirmedAware) {
      wx.showToast({ title: '未选择知晓度，默认按“是，了解”提交', icon: 'none', duration: 1800 });
    }
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中' });
    try {
      const combinedContent = [serviceComment, stylistComment, comment].filter(Boolean).join('\n');
      const isContentSafe = await this.checkContentSecurity(combinedContent);
      if (!isContentSafe) {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showModal({
          title: '内容未通过审核',
          content: '您输入的内容可能包含敏感信息，请修改后重新提交。',
          showCancel: false,
          confirmText: '我知道了',
        });
        return;
      }
      await createReview({
        shopId: booking.shopId,
        customerId,
        bookingId: booking.id,
        stylistId: booking.barberId,
        serviceScore: Number(serviceScore),
        stylistScore: Number(stylistScore),
        serviceComment: String(serviceComment || ''),
        stylistComment: String(stylistComment || ''),
        isAwareOfMembershipBenefits: Boolean(isAwareOfMembershipBenefits),
        comment: String(comment || ''),
      });
      const avg = ((Number(serviceScore) + Number(stylistScore)) / 2).toFixed(1);
      this.setData({ submitted: true, avgScore: avg });
      wx.hideLoading();
      wx.showToast({ title: '评价已提交', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      const msg = (err && err.message) ? err.message : '提交失败，请重试';
      wx.showToast({ title: msg, icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  // ========== 分享引导（复制链接） ==========
  onCopyShareLink() {
    const shopId = (this.data.booking && this.data.booking.shopId) || this.data.shopId;
    const url = `https://www.hsxx8888.cn/s/${shopId}`;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: '链接已复制', icon: 'success' });
      },
    });
  },

  onBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  goToProfile() {
    wx.redirectTo({ url: '/pages/profile/profile' });
  },

  stopPropagation() {
    // 阻止点击内容时穿透关闭
  },
});
