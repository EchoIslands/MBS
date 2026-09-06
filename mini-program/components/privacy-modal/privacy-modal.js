const PRIVACY_ACCEPTED_KEY = 'mbs_privacy_accepted';

Component({
  options: {
    addGlobalClass: true,
  },

  data: {
    visible: false,
  },

  lifetimes: {
    attached() {
      this.checkAccepted();
    },
  },

  methods: {
    checkAccepted() {
      try {
        const accepted = wx.getStorageSync(PRIVACY_ACCEPTED_KEY);
        if (!accepted) {
          this.setData({ visible: true });
        }
      } catch (e) {
        this.setData({ visible: true });
      }
    },

    onAgreementTap() {
      wx.navigateTo({ url: '/pages/agreement/agreement' });
    },

    onPrivacyTap() {
      wx.navigateTo({ url: '/pages/privacy/privacy' });
    },

    onAccept() {
      wx.setStorageSync(PRIVACY_ACCEPTED_KEY, true);
      this.setData({ visible: false });
      this.triggerEvent('accept');
    },

    onDecline() {
      this.triggerEvent('decline');
    },

    stopPropagation() {
      // 防止点击内容穿透关闭
    },
  },
});
