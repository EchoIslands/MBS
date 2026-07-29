// 小程序全局入口
// 注意：当前顾客端仍使用 customerId 明文传参，待资质到位后统一改造为 token 鉴权。

// 需要过滤的游客模式/开发者工具内部错误
const IGNORE_ERROR_PATTERNS = [
  'webapi_getwxaasyncinfo:fail',
  '__global is not defined',
  'Cannot read properties of null',
];

function shouldIgnoreError(err) {
  if (!err) return true;
  const errStr = typeof err === 'string' ? err : String(err);
  return IGNORE_ERROR_PATTERNS.some((pattern) => errStr.includes(pattern));
}

App({
  globalData: {
    customerId: '',
    customerInfo: null,
    apiBase: '',
  },

  onLaunch() {
    console.log('[app] MBS 小程序启动');
    wx.onError((err) => {
      if (!shouldIgnoreError(err)) {
        console.warn('[app] 全局 onError:', err);
      }
    });
    wx.onUnhandledRejection((res) => {
      const reason = res && res.reason;
      if (!shouldIgnoreError(reason)) {
        console.warn('[app] 未处理的 Promise 拒绝:', reason);
      }
    });
  },

  onError(err) {
    if (!shouldIgnoreError(err)) {
      console.warn('[app] App.onError:', err);
    }
  },
});
