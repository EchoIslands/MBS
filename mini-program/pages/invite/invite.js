import { generateInviteCode } from '../../api/referral';
import { getCustomerId } from '../../utils/storage';

Page({
  data: {
    loading: true,
    error: '',
    customerId: '',
    qrCodeDataUrl: '',
    inviteUrl: '',
    referrerName: '会员',
  },

  async onLoad(options) {
    const customerId = options.customerId || getCustomerId();
    if (!customerId) {
      this.setData({ loading: false, error: '请先登录' });
      return;
    }
    this.setData({ customerId });
    await this.loadInviteCode();
  },

  async loadInviteCode() {
    try {
      this.setData({ loading: true, error: '' });
      const res = await generateInviteCode(this.data.customerId);
      if (res.success) {
        this.setData({
          qrCodeDataUrl: res.data.qrCodeDataUrl,
          inviteUrl: res.data.inviteUrl,
          referrerName: res.data.referrerName || '会员',
          loading: false,
        });
      } else {
        this.setData({ loading: false, error: res.error || '生成邀请码失败' });
      }
    } catch (err) {
      this.setData({ loading: false, error: err.message || '生成邀请码失败' });
    }
  },

  onRetry() {
    this.loadInviteCode();
  },

  onPreviewQrCode() {
    const { qrCodeDataUrl } = this.data;
    if (!qrCodeDataUrl) return;
    wx.previewImage({
      urls: [qrCodeDataUrl],
      current: qrCodeDataUrl,
    });
  },

  onSaveQrCode() {
    const { qrCodeDataUrl } = this.data;
    if (!qrCodeDataUrl) return;

    // base64 转临时文件路径
    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/invite_qrcode.png`;
    const base64Data = qrCodeDataUrl.replace(/^data:image\/\w+;base64,/, '');

    try {
      fs.writeFileSync(filePath, base64Data, 'base64');
      wx.saveImageToPhotosAlbum({
        filePath,
        success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
        fail: (err) => {
          if (err.errMsg?.includes('auth deny') || err.errMsg?.includes('authorize')) {
            wx.showModal({
              title: '需要授权',
              content: '保存图片需要相册权限，请在设置中开启',
              showCancel: false,
            });
          } else {
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
        },
      });
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  onShareAppMessage() {
    const { inviteUrl, referrerName, qrCodeDataUrl } = this.data;
    const ref = inviteUrl ? inviteUrl.split('ref=')[1] : '';
    return {
      title: `${referrerName || '会员'} 邀请你体验 MBS 美发服务`,
      path: ref ? `/pages/invite/claim?ref=${ref}` : '/pages/invite/claim',
      imageUrl: qrCodeDataUrl || '',
    };
  },

  onShareTimeline() {
    const { inviteUrl, referrerName } = this.data;
    const ref = inviteUrl ? inviteUrl.split('ref=')[1] : '';
    return {
      title: `${referrerName || '会员'} 邀请你加入 MBS`,
      query: ref ? `ref=${ref}` : '',
    };
  },
});
