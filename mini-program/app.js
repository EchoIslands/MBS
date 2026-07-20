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
    // 后续接入 wx.login 后，在这里调用登录接口
  },
});
