import { getCustomerPublic, getCustomerBookings, updateMyProfile, uploadMyAvatar } from '../../api/customer';
import { getShop } from '../../api/shop';
import { cancelBooking, respondDelay } from '../../api/booking';
import { getCustomerReviews } from '../../api/review';
import { getCustomerId, getToken, clearCustomerId, setRouteParams } from '../../utils/storage';
import { ensureLogin } from '../../utils/auth';
import { createTabSwipeHandlers, syncTabBarSelected } from '../../utils/tab-swipe';
import {
  PurchaseVIPLevel,
  StoredValueLevel,
  BenefitType,
  purchaseVIPPlans,
  storedValuePlans,
  getPurchaseVIPLabel,
  getStoredValueLabel,
  getCustomerEffectiveDiscount,
  isVIPExpiringSoon,
  isStoredValueExpiringSoon,
  generateBenefits,
  getStockholderBenefitSummary,
} from '../../utils/membership';

function toTwoDigits(n) {
  return String(n).padStart(2, '0');
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return `${d.getFullYear()}-${toTwoDigits(d.getMonth() + 1)}-${toTwoDigits(d.getDate())}`;
}

function formatDateTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]} ${toTwoDigits(d.getHours())}:${toTwoDigits(d.getMinutes())}`;
}

function formatShortDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return `${d.getFullYear()}/${toTwoDigits(d.getMonth() + 1)}/${toTwoDigits(d.getDate())}`;
}

function truncate(str, maxLen = 80) {
  if (!str || typeof str !== 'string') return str;
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

function slimCustomer(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    name: truncate(raw.name, 40) || '顾客',
    avatar: raw.avatar || '',
    gender: raw.gender || '',
    birthday: raw.birthday || '',
    phone: raw.phone || '',
    shopId: raw.shopId || raw.shop_id || '',
    purchaseVIPLevel: raw.purchaseVIPLevel ?? raw.purchase_vip_level ?? PurchaseVIPLevel.REGULAR,
    storedValueLevel: raw.storedValueLevel ?? raw.stored_value_level ?? StoredValueLevel.NONE,
    purchaseVIPExpiresAt: raw.purchaseVIPExpiresAt || raw.purchase_vip_expires_at,
    storedValueExpiresAt: raw.storedValueExpiresAt || raw.stored_value_expires_at,
    storedValueBalance: raw.storedValueBalance ?? raw.stored_value_balance ?? raw.balance ?? 0,
    balance: raw.balance ?? 0,
    withdrawableReferralAmount: raw.withdrawableReferralAmount ?? raw.withdrawable_referral_amount ?? 0,
    points: raw.points ?? 0,
    totalSpent: raw.totalSpent ?? raw.total_spent ?? 0,
    isStockholder: !!raw.isStockholder || !!raw.is_stockholder,
    referralEarnings: raw.referralEarnings ?? raw.referral_earnings ?? 0,
    referralBonusRate: raw.referralBonusRate ?? raw.referral_bonus_rate ?? 0.1,
    memberBenefitRecords: Array.isArray(raw.memberBenefitRecords)
      ? raw.memberBenefitRecords.slice(0, 20).map((b) => ({
          type: b.type,
          name: truncate(b.name, 40),
          status: b.status,
          expiresAt: b.expiresAt || b.expires_at,
        }))
      : Array.isArray(raw.benefits)
        ? raw.benefits.slice(0, 20).map((b) => ({
            type: b.type,
            name: truncate(b.name, 40),
            status: b.status,
            expiresAt: b.expiresAt || b.expires_at,
          }))
        : [],
  };
}

function slimBookings(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 50).map((b) => ({
    id: b.id,
    shopId: b.shopId || b.shop_id,
    shopName: truncate(b.shopName || b.shop_name, 40) || 'MBS 理发店',
    serviceName: truncate(b.serviceName || b.service_name, 60) || '未知服务',
    status: b.status,
    scheduledTime: b.scheduledTime || b.scheduled_time,
    price: b.price,
    barberName: truncate(b.barberName || b.barber_name || b.stylistName || b.stylist_name, 30) || '待安排',
    queueNumber: b.queueNumber || b.queue_number,
    notes: truncate(b.notes, 200),
    delayState: b.delayState || b.delay_state,
    delayReason: truncate(b.delayReason || b.delay_reason, 120),
  }));
}

Page({
  ...createTabSwipeHandlers(3),
  data: {
    customer: null,
    bookings: [],
    filteredBookings: [],
    hasFilteredBookings: false,
    loading: true,
    error: '',
    activeTab: 'current',
    purchaseVIPPlans,
    storedValuePlans,
    PurchaseVIPLevel,
    StoredValueLevel,
    BenefitType,
    // 计算字段
    purchaseLevel: PurchaseVIPLevel.REGULAR,
    storedLevel: StoredValueLevel.NONE,
    effectiveDiscount: 1,
    expiringSoon: false,
    storedExpiringSoon: false,
    purchasePlan: null,
    storedPlan: null,
    balance: 0,
    withdrawable: 0,
    points: 0,
    totalSpent: 0,
    myBenefits: [],
    stockholderSummary: { isStockholder: false, enabled: false, benefits: [] },
    vipHeaderClass: 'vip-header gradient-vip-regular',
    // 预约详情弹窗
    viewingBooking: null,
    cancelling: false,
    // 延时改签
    rescheduleTarget: null,
    rescheduleDate: '',
    rescheduleTime: '',
    rescheduling: false,
    shopPhone: '',
    editVisible: false,
    editName: '',
    editAvatar: '',
    genderOptions: ['不展示', '男', '女', '其他'],
    editGender: '',
    editBirthday: '',
    editBirthdayMax: new Date().toISOString().slice(0, 10),
    editSaving: false,
    editAvatarUploading: false,
    // 顾客评价映射：bookingId -> review对象
    bookingReviewMap: {},
    bookingReviewedMap: {},
    // 页面状态标志，避免 onShow 重复加载
    _profileLoaded: false,
    _needRefresh: false,
  },

  async onLoad() {
    if (!getCustomerId() || !getToken()) {
      await this.loadProfile();
      return;
    }
    this.loadStoreContact();
    await this.loadProfile();
  },

  async loadStoreContact() {
    try {
      const shop = await getShop('shop1');
      if (!shop || shop.isActive === false) throw new Error('门店暂不可用');
      const publicPhone = /^(?:1\d{10}|0\d{2,3}-?\d{7,8}|[2-9]\d{7})$/.test(String(shop.phone || '')) && !['13800138001', '13900000001'].includes(String(shop.phone)) ? shop.phone : '';
      this.setData({
        shopPhone: publicPhone,
      });
    } catch (err) {
      console.warn('[profile] 门店联系方式加载失败');
    }
  },

  async onShow() {
    syncTabBarSelected(this, 3);
    if (!getCustomerId() || !getToken()) return;
    // 首次由 onLoad 加载；从其他主页面或详情页返回时刷新预约、排队和会员状态。
    if (!this._profileShown) { this._profileShown = true; return; }
    this.setData({ _needRefresh: false });
    await this.loadProfile();
  },

  async loadProfile() {
    const customerId = getCustomerId();
    if (!customerId || !getToken()) {
      if (customerId) clearCustomerId();
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }

    this.setData({ loading: !this.data.customer, error: '' });
    try {
      const [rawCustomer, rawBookings, rawReviews] = await Promise.all([
        getCustomerPublic(customerId),
        getCustomerBookings(customerId),
        getCustomerReviews(customerId).catch((err) => {
          console.warn('[profile] 加载顾客评价失败，继续展示其他内容:', err);
          return [];
        }),
      ]);
      const customer = slimCustomer(rawCustomer);
      const allBookings = slimBookings(rawBookings);

      // 加载顾客评价，构建 bookingId → review 映射（三端协同，对齐H5 Profile的bookingReviewMap）
      const bookingReviewMap = {};
      const bookingReviewedMap = {};
      (rawReviews || []).forEach((r) => {
        if (r && r.bookingId) {
          bookingReviewMap[r.bookingId] = r;
          bookingReviewedMap[r.bookingId] = true;
        }
      });

      const purchaseLevel = customer?.purchaseVIPLevel ?? PurchaseVIPLevel.REGULAR;
      const storedLevel = customer?.storedValueLevel ?? StoredValueLevel.NONE;
      const effectiveDiscount = customer ? getCustomerEffectiveDiscount(customer) : 1;
      const expiringSoon = isVIPExpiringSoon(customer);
      const storedExpiringSoon = isStoredValueExpiringSoon(customer);
      const purchasePlan = purchaseVIPPlans.find((p) => p.level === purchaseLevel);
      const storedPlan = storedValuePlans.find((p) => p.level === storedLevel);

      // 三方协同：优先从最近预约获取店铺配置，与 H5 保持一致
      let shop = null;
      try {
        const recentShopId = allBookings[0]?.shopId;
        shop = recentShopId ? await getShop(recentShopId) : null;
      } catch (shopErr) {
        console.warn('[profile] 获取最近预约店铺配置失败，使用默认配置:', shopErr);
        shop = null;
      }
      const stockholderSummary = getStockholderBenefitSummary(customer, shop);
      const vipHeaderClass = this.computeVipHeaderClass(purchaseLevel);
      const payload = {
        customer,
        bookings: allBookings,
        loading: false,
        purchaseLevel,
        storedLevel,
        effectiveDiscount,
        expiringSoon,
        storedExpiringSoon,
        purchasePlan,
        storedPlan,
        balance: customer?.storedValueBalance ?? customer?.balance ?? 0,
        withdrawable: customer?.withdrawableReferralAmount ?? 0,
        points: customer?.points ?? 0,
        totalSpent: customer?.totalSpent ?? 0,
        myBenefits: this.computeMyBenefits(customer),
        stockholderSummary,
        vipHeaderClass,
        shopPhone: this.data.shopPhone || '',
        bookingReviewMap,
        bookingReviewedMap,
        isMember: this.isCustomerMember(customer),
        _profileLoaded: true,
        _needRefresh: false,
      };
      const sizeKB = Math.round(JSON.stringify(payload).length / 1024);
      if (sizeKB > 500) {
        console.warn(`[profile] setData 数据量仍偏大: ${sizeKB} KB，请检查顾客/预约数据`);
      }
      this.setData(payload);
      this.refreshFilteredBookings();
    } catch (err) {
      console.error('[profile] 加载个人信息失败:', err);
      if (err.statusCode === 401 || /未登录|请先登录|unauthorized/i.test(err.message)) {
        clearCustomerId();
        wx.reLaunch({ url: '/pages/login/login' });
        return;
      }
      this.setData({ error: '个人信息加载失败', loading: false });
    }
  },

  isCustomerMember(customer) {
    if (!customer) return false;
    return !!(
      customer.isStockholder ||
      customer.purchaseVIPLevel !== PurchaseVIPLevel.REGULAR ||
      customer.storedValueLevel !== StoredValueLevel.NONE
    );
  },

  goToMembership() {
    wx.navigateTo({ url: '/pages/membership/membership' });
  },

  goToInvite() {
    const { customer } = this.data;
    if (!customer || !this.isCustomerMember(customer)) {
      wx.showToast({ title: '成为会员后即可邀请好友', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/invite/invite?customerId=${customer.id}` });
  },

  openProfileEdit() {
    const customer = this.data.customer;
    if (!customer) return;
    this.setData({ editVisible: true, editName: customer.name || '', editAvatar: customer.avatar || '',
      editGender: customer.gender || '', editBirthday: customer.birthday || '' });
  },
  closeProfileEdit() { if (!this.data.editSaving) this.setData({ editVisible: false }); },
  onEditName(e) { this.setData({ editName: e.detail.value }); },
  onEditGender(e) { this.setData({ editGender: ['','male','female','other'][Number(e.detail.value)] || '' }); },
  onEditBirthday(e) { this.setData({ editBirthday: e.detail.value }); },
  chooseProfileAvatar() {
    if (this.data.editAvatarUploading || this.data.editSaving) return;
    wx.chooseMedia({ count: 1, mediaType: ['image'], sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success: ({ tempFiles }) => {
        const file = tempFiles && tempFiles[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { wx.showToast({ title: '头像不能超过2MB', icon: 'none' }); return; }
        this.setData({ editAvatarUploading: true });
        wx.getFileSystemManager().readFile({ filePath: file.tempFilePath, encoding: 'base64',
          success: async ({ data }) => {
            try {
              const mime = data.startsWith('iVBORw0KGgo') ? 'png'
                : data.startsWith('UklGR') ? 'webp' : data.startsWith('/9j/') ? 'jpeg' : null;
              if (!mime) throw new Error('请选择 PNG、JPEG 或 WebP 图片');
              const url = await uploadMyAvatar('data:image/' + mime + ';base64,' + data);
              this.setData({ editAvatar: url });
            } catch (err) { wx.showToast({ title: err.message || '头像上传失败', icon: 'none' }); }
            finally { this.setData({ editAvatarUploading: false }); }
          },
          fail: () => { this.setData({ editAvatarUploading: false }); wx.showToast({ title: '头像读取失败', icon: 'none' }); },
        });
      },
      fail: (err) => {
        if (!/cancel/i.test(err?.errMsg || '')) {
          wx.showToast({ title: '无法打开相册，请检查微信的照片权限', icon: 'none' });
        }
      },
    });
  },
  async saveProfileEdit() {
    if (this.data.editSaving || this.data.editAvatarUploading) return;
    const name = String(this.data.editName || '').trim();
    if (!name || name.length > 40) { wx.showToast({ title: '请输入1至40字称呼', icon: 'none' }); return; }
    const customer = this.data.customer;
    const fields = {};
    if (name !== customer.name) fields.name = name;
    if ((this.data.editAvatar || '') !== (customer.avatar || '')) fields.avatar = this.data.editAvatar || null;
    if ((this.data.editGender || '') !== (customer.gender || '')) fields.gender = this.data.editGender || null;
    if ((this.data.editBirthday || '') !== (customer.birthday || '')) fields.birthday = this.data.editBirthday || null;
    if (!Object.keys(fields).length) {
      this.setData({ editVisible: false });
      wx.showToast({ title: '资料没有变化', icon: 'none' });
      return;
    }
    this.setData({ editSaving: true });
    try {
      await updateMyProfile(customer.id, fields);
      this.setData({ editVisible: false });
      wx.showToast({ title: '资料已保存', icon: 'success' });
      await this.loadProfile();
    } catch (err) { wx.showToast({ title: err.message || '保存失败', icon: 'none' }); }
    finally { this.setData({ editSaving: false }); }
  },

  refreshFilteredBookings() {
    const { bookings, activeTab } = this.data;
    const filtered = bookings.filter((b) =>
      activeTab === 'current'
        ? b.status === 'pending' || b.status === 'confirmed'
        : b.status === 'completed' || b.status === 'cancelled'
    );
    this.setData({ filteredBookings: filtered, hasFilteredBookings: filtered.length > 0 });
  },

  switchTab(e) {
    const { tab } = e.currentTarget.dataset;
    this.setData({ activeTab: tab });
    this.refreshFilteredBookings();
  },

  onRefresh() {
    this.setData({ _needRefresh: true });
    this.loadProfile();
  },

  onBookingTap(e) {
    const { id } = e.currentTarget.dataset;
    const booking = this.data.bookings.find((b) => b.id === id);
    if (booking) {
      this.setData({ viewingBooking: booking });
    }
  },

  closeBookingModal() {
    this.setData({ viewingBooking: null });
  },

  openReschedule(e) {
    const { id } = e.currentTarget.dataset;
    const booking = this.data.bookings.find((b) => b.id === id);
    if (!booking) return;
    const d = new Date(booking.scheduledTime);
    const pad = (n) => String(n).padStart(2, '0');
    const dateVal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeVal = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    this.setData({ rescheduleTarget: booking, rescheduleDate: dateVal, rescheduleTime: timeVal, viewingBooking: null });
  },

  onRescheduleDateChange(e) {
    this.setData({ rescheduleDate: e.detail.value });
  },

  onRescheduleTimeChange(e) {
    this.setData({ rescheduleTime: e.detail.value });
  },

  closeRescheduleModal() {
    this.setData({ rescheduleTarget: null });
  },

  async submitReschedule() {
    const { rescheduleTarget, rescheduleDate, rescheduleTime, customer } = this.data;
    if (!rescheduleTarget || !customer || !rescheduleDate || !rescheduleTime) return;
    this.setData({ rescheduling: true });
    try {
      await respondDelay(rescheduleTarget.id, {
        customerId: customer.id,
        action: 'reschedule',
        scheduledTime: `${rescheduleDate}T${rescheduleTime}`,
      });
      wx.showToast({ title: '改时间成功', icon: 'success' });
      this.setData({ rescheduleTarget: null, rescheduling: false });
      await this.loadProfile();
    } catch (err) {
      console.error('[profile] 改时间失败:', err);
      wx.showToast({ title: err.message || '改时间失败，该时段可能与其他预约冲突', icon: 'none' });
      this.setData({ rescheduling: false });
    }
  },

  callStore() {
    const { shopPhone } = this.data;
    if (!shopPhone) {
      wx.showToast({ title: '暂无门店电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({
      phoneNumber: shopPhone,
      fail: () => wx.showToast({ title: '拨打失败', icon: 'none' }),
    });
  },

  stopPropagation() {},

  async handleCancelBooking() {
    const { viewingBooking, customer } = this.data;
    if (!viewingBooking || !customer) return;

    const res = await wx.showModal({
      title: '取消预约',
      content: '确定要取消这次预约吗？取消后无法恢复。',
    });
    if (!res.confirm) return;

    this.setData({ cancelling: true });
    try {
      await cancelBooking(viewingBooking.id, customer.id);
      wx.showToast({ title: '已取消预约', icon: 'success' });
      this.setData({ viewingBooking: null, cancelling: false });
      await this.loadProfile();
    } catch (err) {
      console.error('[profile] 取消预约失败:', err);
      wx.showToast({ title: err.message || '取消失败，请重试', icon: 'none' });
      this.setData({ cancelling: false });
    }
  },

  goToQueue(e) {
    const viewingBooking = e?.currentTarget?.dataset?.id ? {id:e.currentTarget.dataset.id} : this.data.viewingBooking;
    if (!viewingBooking) return;
    this.setData({ viewingBooking: null });
    setRouteParams({ bookingId: viewingBooking.id });
    wx.navigateTo({ url: '/pages/queue/queue' });
  },

  goToReview() {
    const booking = this.data.viewingBooking;
    if (!booking) {
      wx.showToast({ title: '缺少预约信息', icon: 'none' });
      return;
    }
    this.setData({ viewingBooking: null });
    setRouteParams({ bookingId: booking.id });
    wx.navigateTo({ url: `/pages/review/review?bookingId=${encodeURIComponent(booking.id)}` });
  },

  goToBooking() {
    if (!ensureLogin({ content: '登录后即可预约门店服务' })) return;
    wx.switchTab({ url: '/pages/booking/booking' });
  },

  goToFeedback() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  goToRefund() {
    const { customer } = this.data;
    if (!customer) {
      ensureLogin({ content: '登录后即可申请退款和查看退款进度' });
      return;
    }
    wx.navigateTo({ url: `/pages/refund/refund?shopId=${encodeURIComponent(customer.shopId || 'shop1')}` });
  },

  goToProductOrders() {
    const { customer } = this.data;
    if (!customer) {
      ensureLogin({ content: '登录后即可查看你的商品订单' });
      return;
    }
    if (!customer.shopId) {
      wx.showToast({ title: '门店信息未加载，请刷新后重试', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/product-orders/product-orders?shopId=${encodeURIComponent(customer.shopId)}` });
  },

  
  goToPackages() {
    const { customer } = this.data;
    if (!customer) {
      ensureLogin({ content: '登录后即可查看你的次卡' });
      return;
    }
    wx.navigateTo({ url: `/pages/packages/packages?customerId=${customer.id}&shopId=${customer.shopId || 'shop1'}` });
  },
goToCoupons() {
    const { customer } = this.data;
    if (!customer) {
      ensureLogin({ content: '登录后即可查看你的优惠券' });
      return;
    }
    wx.navigateTo({ url: `/pages/my-coupons/my-coupons?shopId=${customer.shopId || 'shop1'}` });
  },

  goToPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  goToAgreement() {
    wx.navigateTo({ url: '/pages/agreement/agreement' });
  },

  goToShop() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  handleLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (res.confirm) {
          clearCustomerId();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      },
    });
  },

  formatDate,
  formatDateTime,
  formatShortDate,
  getPurchaseVIPLabel,
  getStoredValueLabel,

  formatDiscount(discount) {
    return (discount * 10).toFixed(2);
  },

  benefitIconColor(type) {
    const map = {
      [BenefitType.SHAMPOO]: 'var(--blue-500)',
      [BenefitType.CONDITIONER]: 'var(--pink-500)',
      [BenefitType.FREE_HAIRCUT]: 'var(--purple-500)',
      [BenefitType.DRINK]: 'var(--accent)',
      [BenefitType.REDO]: 'var(--danger)',
    };
    return map[type] || 'var(--text-tertiary)';
  },

  computeMyBenefits(customer) {
    if (!customer) return [];
    // 优先与 H5 保持一致：使用后端返回的可用权益记录
    const records = customer.memberBenefitRecords || customer.benefits;
    if (Array.isArray(records) && records.length > 0) {
      return records
        .filter((b) => b.status === 'available')
        .map((b) => ({
          type: b.type || BenefitType.SHAMPOO,
          name: b.name || '会员权益',
          description: b.expiresAt
            ? `有效期至 ${formatShortDate(b.expiresAt)}`
            : '无固定期限',
          expiresAt: b.expiresAt,
        }));
    }
    // 兜底：根据购买 VIP 等级生成权益
    return generateBenefits(customer).map((b) => ({
      ...b,
      description: '无固定期限',
    }));
  },

  benefitIconName(type) {
    const map = {
      [BenefitType.SHAMPOO]: 'sparkles',
      [BenefitType.CONDITIONER]: 'sparkles',
      [BenefitType.FREE_HAIRCUT]: 'scissors',
      [BenefitType.DRINK]: 'star',
      [BenefitType.REDO]: 'alertCircle',
    };
    return map[type] || 'gift';
  },

  computeVipHeaderClass(purchaseLevel) {
    const map = {
      [PurchaseVIPLevel.REGULAR]: 'gradient-vip-regular',
      [PurchaseVIPLevel.BRONZE]: 'gradient-vip-bronze',
      [PurchaseVIPLevel.SILVER]: 'gradient-vip-silver',
      [PurchaseVIPLevel.GOLD]: 'gradient-vip-gold',
      [PurchaseVIPLevel.DIAMOND]: 'gradient-vip-diamond',
    };
    return `vip-header ${map[purchaseLevel] || 'gradient-vip-regular'}`;
  },
});
