import { generateInviteCode } from '../../api/referral';
import { getCustomerId } from '../../utils/storage';
import { ensureLogin } from '../../utils/auth';

Page({
  data: {
    loading: true,
    error: '',
    customerId: '',
    qrCodeDataUrl: '',
    qrCodePath: '',
    referralId: '',
    inviteUrl: '',
    referrerName: '会员',
  },

  async onLoad(options) {
    if (options.ref || options.scene) {
      const ref = options.ref || options.scene;
      wx.redirectTo({ url: '/pages/invite/claim?' + (options.scene ? 'scene=' : 'ref=') + encodeURIComponent(ref) });
      return;
    }
    const customerId = getCustomerId();
    if (!customerId) {
      this.setData({ loading: false, error: '' });
      ensureLogin({ content: '登录后即可查看邀请码' });
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
        const filePath = `${wx.env.USER_DATA_PATH}/invite_qrcode.png`;
        wx.getFileSystemManager().writeFileSync(filePath, res.data.qrCodeDataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        this.setData({
          referralId: res.data.referralId,
          qrCodePath: filePath,
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
    const { qrCodePath } = this.data;
    if (!qrCodePath) return;
    wx.previewImage({
      urls: [qrCodePath],
      current: qrCodePath,
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
    const { referralId: ref, referrerName } = this.data;
    return {
      title: `${referrerName || '会员'} 邀请你体验 MBS 美发服务`,
      path: ref ? `/pages/invite/claim?ref=${ref}` : '/pages/invite/claim',
    };
  },

  onShareTimeline() {
    const { referralId: ref, referrerName } = this.data;
    return {
      title: `${referrerName || '会员'} 邀请你加入 MBS`,
      query: ref ? `ref=${ref}` : '',
    };
  },
});
