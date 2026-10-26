import { getCustomerRefunds, getCustomerRefundCandidates, requestCustomerSettlementRefund } from '../../api/customer';
import { getCustomerId } from '../../utils/storage';
import { ensureLogin } from '../../utils/auth';

const STATUS_TEXT = {
  pending: '待处理',
  approved: '已批准，待实际退款',
  rejected: '已拒绝',
  completed: '已完成',
  cancelled: '已取消',
};

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

Page({
  data: {
    shopId: 'shop1',
    customerId: '',
    records: [],
    candidates: [],
    selectedIndex: -1,
    selectedSettlement: '',
    reason: '',
    loading: true,
    submitting: false,
    error: '',
  },

  onLoad(options) {
    this.setData({ shopId: options.shopId || 'shop1' });
  },

  onShow() {
    const customerId = getCustomerId();
    if (!customerId) {
      this.setData({ loading: false });
      ensureLogin({ content: '登录后即可申请退款和查看退款进度' });
      return;
    }
    this.setData({ customerId });
    this.loadData(customerId);
  },

  onPullDownRefresh() {
    const customerId = this.data.customerId || getCustomerId();
    if (customerId) {
      this.loadData(customerId).finally(() => wx.stopPullDownRefresh());
    } else {
      wx.stopPullDownRefresh();
    }
  },

  async loadData(customerId) {
    this.setData({ loading: true, error: '' });
    try {
      const [records, candidates] = await Promise.all([
        getCustomerRefunds(customerId),
        getCustomerRefundCandidates(customerId),
      ]);
      const activeRecords = (records || []).filter((record) => !['rejected', 'cancelled'].includes(record.status));
      const available = (candidates || [])
        .filter((candidate) => !activeRecords.some((record) => record.settlementId === candidate.settlementId))
        .map((candidate) => ({
          ...candidate,
          amountText: formatAmount(candidate.amount),
          createdAtText: formatTime(candidate.createdAt),
          displayLabel: `${candidate.serviceName || '服务'} · ¥${formatAmount(candidate.amount)} · ${formatTime(candidate.createdAt)}`,
        }));
      const normalizedRecords = (records || []).map((record) => ({
        ...record,
        amountText: formatAmount(record.amount),
        statusText: STATUS_TEXT[record.status] || '处理中',
        createdAtText: formatTime(record.createdAt),
        processedAtText: formatTime(record.processedAt),
        refundReceiptAtText: formatTime(record.refundReceiptAt),
        receiptAmountText: record.refundReceiptAmount == null ? '' : formatAmount(record.refundReceiptAmount),
      }));
      this.setData({ records: normalizedRecords, candidates: available, selectedIndex: -1, selectedSettlement: '', loading: false });
    } catch (err) {
      console.error('[refund] 加载退款信息失败:', err);
      this.setData({ records: [], candidates: [], loading: false, error: err.message || '退款信息加载失败' });
    }
  },

  onSettlementChange(e) {
    const index = Number(e.detail.value);
    const candidate = this.data.candidates[index];
    this.setData({ selectedIndex: index, selectedSettlement: candidate?.settlementId || '' });
  },

  onReasonInput(e) {
    this.setData({ reason: e.detail.value || '' });
  },

  async submitRefund() {
    const { customerId, selectedSettlement, reason, submitting } = this.data;
    if (submitting) return;
    if (!selectedSettlement) {
      wx.showToast({ title: '请选择已付款服务', icon: 'none' });
      return;
    }
    if (!reason.trim()) {
      wx.showToast({ title: '请填写退款原因', icon: 'none' });
      return;
    }
    if (!customerId || !ensureLogin({ content: '登录后即可申请退款' })) return;

    this.setData({ submitting: true, error: '' });
    try {
      await requestCustomerSettlementRefund(customerId, selectedSettlement, reason.trim());
      wx.showToast({ title: '退款申请已提交', icon: 'success' });
      this.setData({ selectedIndex: -1, selectedSettlement: '', reason: '' });
      await this.loadData(customerId);
    } catch (err) {
      console.error('[refund] 提交退款申请失败:', err);
      wx.showToast({ title: err.message || '退款申请提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  goBack() {
    wx.navigateBack();
  },
});
