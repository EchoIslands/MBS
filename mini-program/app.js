// 小程序全局入口
// 注意：当前顾客端仍使用 customerId 明文传参，待资质到位后统一改造为 token 鉴权。

App({
  globalData: {
    customerId: '',
    customerInfo: null,
    apiBase: '',
  },

  onLaunch() {
    console.log('[app] MBS 小程序启动');
    // 全局错误兜底，避免微信开发者工具错误上报器抛出无关的 bg/__global 日志
    wx.onError((err) => {
      console.warn('[app] 全局 onError:', err);
    });
    wx.onUnhandledRejection((res) => {
      console.warn('[app] 未处理的 Promise 拒绝:', res.reason);
    });
    // 后续接入 wx.login 后，在这里调用登录接口
  },

  onError(err) {
    console.warn('[app] App.onError:', err);
  },
});
