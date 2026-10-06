/**
 * 小程序登录态守卫
 * 统一处理"未登录"场景：弹出登录对话框，确认后跳转登录页
 */
import { getCustomerId } from './storage';

const LOGIN_PAGE = '/pages/login/login';

/**
 * 校验登录态；未登录时弹出登录对话框
 * @param {{ title?: string, content?: string }} [options]
 * @returns {boolean} 是否已登录
 */
export function ensureLogin(options = {}) {
  if (getCustomerId()) return true;

  wx.showModal({
    title: options.title || '未登录',
    content: options.content || '登录后即可使用该功能',
    confirmText: '去登录',
    cancelText: '取消',
    confirmColor: '#2563eb',
    success: (res) => {
      if (res.confirm) {
        wx.navigateTo({ url: LOGIN_PAGE });
      }
    },
  });
  return false;
}
