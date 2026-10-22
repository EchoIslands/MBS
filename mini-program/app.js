import { enforcePasswordChange } from './utils/password-gate';
// 所有 Page 的深链、返回和切 tab 均受同一守卫约束。
const registerPage = Page;
Page = function(config) {
  const guarded = { ...config };
  ['onLoad', 'onShow'].forEach((lifecycle) => {
    const original = config[lifecycle];
    guarded[lifecycle] = function(...args) {
      if (enforcePasswordChange(this.route)) return;
      return original && original.apply(this, args);
    };
  });
  return registerPage(guarded);
};
// 小程序全局入口
// 顾客 API 使用缓存的短期 bearer token 验证本人身份，customerId 仅用于资源定位。

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

    // 启动行为埋点自动上报
    try {
      const tracking = require('./utils/tracking');
      tracking.startAutoFlush();
    } catch (e) {
      console.warn('[app] 埋点初始化失败:', e);
    }
  },

  onError(err) {
    if (!shouldIgnoreError(err)) {
      console.warn('[app] App.onError:', err);
    }
  },
});
