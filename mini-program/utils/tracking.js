/**
 * MBS 小程序行为埋点 SDK
 *
 * 采集 5 个关键事件：
 * - page_view：页面访问
 * - service_detail_view：查看服务详情
 * - add_to_cart：加入购物车
 * - booking_start：进入预约页面/选择服务
 * - booking_complete：完成预约
 *
 * 机制：
 * - 事件先入本地队列，批量异步上报；
 * - 上报失败保留在本地，下次启动或达到阈值时重试；
 * - 不阻塞业务主流程。
 */

import { request } from './api';
import { getCustomerId } from './storage';

const STORAGE_KEY = 'mbs_tracking_queue';
const SESSION_KEY = 'mbs_tracking_session';
const LAST_PAGE_KEY = 'mbs_tracking_last_page';
const FLUSH_INTERVAL = 30000; // 30 秒自动 flush 一次
const MAX_QUEUE_SIZE = 100;   // 本地队列上限，超出时丢弃最旧数据

// 事件类型枚举
export const EventType = {
  PAGE_VIEW: 'page_view',
  SERVICE_DETAIL_VIEW: 'service_detail_view',
  ADD_TO_CART: 'add_to_cart',
  BOOKING_START: 'booking_start',
  BOOKING_COMPLETE: 'booking_complete',
};

// 生成更安全的随机字符串（UUID v4 风格，冲突概率极低）
function generateSecureId() {
  const hex = '0123456789abcdef';
  const parts = [8, 4, 4, 4, 12];
  return parts
    .map((len) => {
      let s = '';
      for (let i = 0; i < len; i++) {
        s += hex[Math.floor(Math.random() * 16)];
      }
      return s;
    })
    .join('-');
}

// 获取小程序版本号（优先 getAppBaseInfo，兼容旧基础库）
function getAppVersion() {
  try {
    if (typeof wx.getAppBaseInfo === 'function') {
      const info = wx.getAppBaseInfo();
      return info.appVersion || '';
    }
    if (typeof wx.getAccountInfoSync === 'function') {
      const info = wx.getAccountInfoSync();
      return info.miniProgram?.version || '';
    }
  } catch (e) {
    console.warn('[tracking] 获取小程序版本号失败:', e);
  }
  return '';
}

// 生成会话 ID（每次小程序冷启动或会话过期时生成）
function ensureSessionId() {
  const now = Date.now();
  let session = wx.getStorageSync(SESSION_KEY);
  if (!session || now - session.startTime > 30 * 60 * 1000) {
    session = {
      id: generateSecureId(),
      startTime: now,
    };
    wx.setStorageSync(SESSION_KEY, session);
  }
  return session.id;
}

// 读取本地队列
function readQueue() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    console.warn('[tracking] 读取队列失败:', e);
    return [];
  }
}

// 写入本地队列
function writeQueue(queue) {
  try {
    wx.setStorageSync(STORAGE_KEY, queue.slice(-MAX_QUEUE_SIZE));
  } catch (e) {
    console.warn('[tracking] 写入队列失败:', e);
  }
}

// 构建事件 payload
function buildEvent(eventType, properties = {}) {
  const customerId = getCustomerId();
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  const route = currentPage ? currentPage.route : '';

  return {
    event_type: eventType,
    platform: 'weapp',
    page_path: route,
    customer_id: customerId || undefined,
    shop_id: properties.shop_id || 'shop1',
    session_id: ensureSessionId(),
    app_version: getAppVersion(),
    timestamp: new Date().toISOString(),
    properties: properties || {},
  };
}

// 将事件加入队列
function enqueue(event) {
  const queue = readQueue();
  queue.push(event);
  writeQueue(queue);
  return queue.length;
}

let flushing = false;

// 立即上报队列中的事件
export async function flush() {
  if (flushing) return;
  const queue = readQueue();
  if (queue.length === 0) return;

  flushing = true;
  try {
    const batch = queue.slice(0, 20);
    await request('/api/analytics/events/batch', {
      method: 'POST',
      body: { events: batch },
    });

    // 上报成功后移除已发送事件
    const remaining = queue.slice(batch.length);
    writeQueue(remaining);
    console.log(`[tracking] 上报 ${batch.length} 条事件，剩余 ${remaining.length}`);
  } catch (err) {
    console.warn('[tracking] 上报失败，保留本地队列:', err.message || err);
  } finally {
    flushing = false;
  }
}

// 触发单个事件
export function track(eventType, properties = {}) {
  const event = buildEvent(eventType, properties);
  enqueue(event);
  // 立即尝试 flush（带轻微抖动，避免高频事件连续请求）
  clearTimeout(track._flushTimer);
  track._flushTimer = setTimeout(flush, 300);
}

// 页面访问（同一页面 5 秒内去重）
export function trackPageView(pagePath, properties = {}) {
  const now = Date.now();
  const last = wx.getStorageSync(LAST_PAGE_KEY) || { path: '', time: 0 };
  if (last.path === pagePath && now - last.time < 5000) return;

  wx.setStorageSync(LAST_PAGE_KEY, { path: pagePath, time: now });
  track(EventType.PAGE_VIEW, { page_path: pagePath, ...properties });
}

// 查看服务详情
export function trackServiceDetailView(serviceId, serviceName, properties = {}) {
  track(EventType.SERVICE_DETAIL_VIEW, {
    service_id: serviceId,
    service_name: serviceName,
    ...properties,
  });
}

// 加入购物车
export function trackAddToCart(productId, productName, quantity, amount, properties = {}) {
  track(EventType.ADD_TO_CART, {
    product_id: productId,
    product_name: productName,
    quantity,
    amount,
    ...properties,
  });
}

// 开始预约
export function trackBookingStart(serviceId, serviceName, properties = {}) {
  track(EventType.BOOKING_START, {
    service_id: serviceId,
    service_name: serviceName,
    ...properties,
  });
}

// 完成预约
export function trackBookingComplete(bookingId, serviceId, serviceName, amount, properties = {}) {
  track(EventType.BOOKING_COMPLETE, {
    booking_id: bookingId,
    service_id: serviceId,
    service_name: serviceName,
    amount,
    ...properties,
  });
}

// 启动自动 flush
export function startAutoFlush() {
  setInterval(flush, FLUSH_INTERVAL);
  // 小程序切到前台时尝试 flush
  wx.onAppShow && wx.onAppShow(() => {
    ensureSessionId();
    flush();
  });
}
