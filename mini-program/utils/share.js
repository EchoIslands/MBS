// 私密页面也可分享小程序，但卡片只能指向公开入口，不能使用当前页面截图。
export const PUBLIC_SHARE_COVER = '/assets/share/shop-card.png';

export function publicShopShare() {
  return {
    title: '皓诗形象设计 · 预约与商城',
    path: '/pages/index/index',
    imageUrl: PUBLIC_SHARE_COVER,
  };
}

function configureShareMenu(allowTimeline) {
  try {
    if (typeof wx.showShareMenu === 'function') {
      wx.showShareMenu({
        menus: allowTimeline ? ['shareAppMessage', 'shareTimeline'] : ['shareAppMessage'],
        fail: () => console.warn('[share] 分享菜单暂不可用'),
      });
    }
    // 朋友圈只能打开当前页面，不能像好友卡片一样改成首页路径。
    if (!allowTimeline && typeof wx.hideShareMenu === 'function') {
      wx.hideShareMenu({ menus: ['shareTimeline'], fail: () => {} });
    }
  } catch (_) {
    // 不支持菜单 API 的客户端不应因此阻断登录、退款或页面显示。
    console.warn('[share] 当前客户端不支持分享菜单设置');
  }
}

export function withPageSharing(config) {
  const originalShow = config.onShow;
  const originalShare = config.onShareAppMessage;
  const originalTimeline = config.onShareTimeline;
  const page = {
    ...config,
    onShow(...args) {
      configureShareMenu(typeof originalTimeline === 'function');
      return originalShow && originalShow.apply(this, args);
    },
    onShareAppMessage(...args) {
      const card = (typeof originalShare === 'function' && originalShare.apply(this, args)) || publicShopShare();
      return { ...card, imageUrl: card.imageUrl || PUBLIC_SHARE_COVER };
    },
  };
  if (typeof originalTimeline === 'function') {
    page.onShareTimeline = function(...args) {
      const card = originalTimeline.apply(this, args) || {};
      // 缺省 query 必须显式清空，不能自动携带当前启动参数。
      return { ...card, query: card.query || '', imageUrl: card.imageUrl || PUBLIC_SHARE_COVER };
    };
  }
  return page;
}
