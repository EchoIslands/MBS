Page({
  data: {
    shopName: '皓诗形象设计',
  },

  onLoad() {
    // 页面加载时可根据需要从全局数据读取店铺名称
  },

  onCopyContact() {
    wx.setClipboardData({
      data: 'contact@hfmbs.cn',
      success: () => {
        wx.showToast({ title: '邮箱已复制', icon: 'success' });
      },
    });
  },
});
