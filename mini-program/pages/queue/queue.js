import { getQueue } from '../../api/queue';
import { getBooking } from '../../api/booking';
import { getShop } from '../../api/shop';
import { takeRouteParams } from '../../utils/storage';

const TIME_SLOT_MINUTES = 30;

const serviceSteps = [
  { key: 'checkin', label: '到店确认', duration: 5 },
  { key: 'wash', label: '洗发', duration: 10 },
  { key: 'haircut', label: '剪发/造型', duration: 25 },
  { key: 'finish', label: '吹干整理', duration: 10 },
];

function toTwoDigits(n) {
  return String(n).padStart(2, '0');
}

function getTimeSlotStart(date) {
  const d = new Date(date);
  const slotStart = Math.floor(d.getMinutes() / TIME_SLOT_MINUTES) * TIME_SLOT_MINUTES;
  d.setMinutes(slotStart, 0, 0);
  d.setMilliseconds(0);
  return d;
}

function formatTimeSlot(date) {
  const start = getTimeSlotStart(date);
  const end = new Date(start.getTime() + TIME_SLOT_MINUTES * 60 * 1000);
  const fmt = (d) => `${toTwoDigits(d.getHours())}:${toTwoDigits(d.getMinutes())}`;
  return `${fmt(start)} - ${fmt(end)}`;
}

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

Page({
  data: {
    shopId: 'shop1',
    queue: null,
    myBooking: null,
    shop: null,
    loading: true,
    error: '',
    currentDate: '',
    // 计算字段
    aheadCount: 0,
    waitTime: 0,
    position: 1,
    serviceMinutes: 30,
    isStarted: false,
    timeSlotLabel: '',
    appointmentInfo: { days: 0, hours: 0, minutes: 0, totalMinutes: 0, isToday: true },
    distance: 1.0,
    walkTime: 12,
    shouldLeaveNow: false,
    reminderEnabled: true,
    currentStep: 0,
    stepProgress: 0,
    overallProgress: 0,
    remainingMinutes: 0,
  },

  progressTimer: null,

  async onLoad(options) {
    const today = new Date().toISOString().split('T')[0];
    this.setData({ currentDate: today });

    const routeParams = takeRouteParams();
    const bookingId = options.bookingId || options.id || (routeParams && routeParams.bookingId);

    await this.loadShop();
    if (bookingId) {
      await this.loadMyBooking(bookingId);
    }
    await this.loadQueue();
    this.loadLocation();
    this.startProgressTimer();
  },

  async onShow() {
    const routeParams = takeRouteParams();
    if (routeParams && routeParams.bookingId) {
      await this.loadMyBooking(routeParams.bookingId);
      await this.loadQueue();
      this.startProgressTimer();
    }
  },

  onHide() {
    this.stopProgressTimer();
  },

  onUnload() {
    this.stopProgressTimer();
  },

  async loadShop() {
    try {
      const shop = await getShop(this.data.shopId);
      this.setData({ shop });
    } catch (err) {
      console.warn('[queue] 加载店铺信息失败:', err);
    }
  },

  async loadQueue() {
    this.setData({ loading: true, error: '' });
    try {
      const queue = await getQueue(this.data.shopId, this.data.currentDate);
      this.setData({ queue, loading: false });
      this.refreshComputed();
    } catch (err) {
      console.error('[queue] 加载排队信息失败:', err);
      this.setData({ error: '排队信息加载失败', loading: false });
    }
  },

  async loadMyBooking(id) {
    try {
      const booking = await getBooking(id);
      this.setData({ myBooking: booking });
      this.refreshComputed();
    } catch (err) {
      console.warn('[queue] 加载我的预约失败:', err);
    }
  },

  loadLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const { shop } = this.data;
        if (shop && shop.latitude && shop.longitude) {
          const distance = calcDistance(res.latitude, res.longitude, shop.latitude, shop.longitude);
          const walkTime = Math.max(5, Math.ceil(distance / 0.083));
          this.setData({ distance, walkTime });
          this.refreshComputed();
        }
      },
      fail: () => {
        const { shop } = this.data;
        const distance = shop && typeof shop.distance === 'number' ? shop.distance : 1.0;
        const walkTime = Math.max(5, Math.ceil(distance / 0.083));
        this.setData({ distance, walkTime });
        this.refreshComputed();
      },
    });
  },

  refreshComputed() {
    const { queue, myBooking, distance, walkTime } = this.data;

    // 排队号与前方等待
    const position = Math.max(1, myBooking?.queueNumber || queue?.currentNumber || 1);
    const currentNumber = Math.max(1, queue?.currentNumber || 1);
    const aheadCount = Math.max(0, position - currentNumber);

    // 服务时长：从队列中找当前预约
    const currentBookingQueueInfo = queue?.bookings?.find((b) => b.id === myBooking?.id);
    const serviceMinutes = currentBookingQueueInfo?.duration || 30;

    // 预约时间相关
    const now = new Date();
    const scheduled = myBooking?.scheduledTime ? new Date(myBooking.scheduledTime) : null;
    const isStarted = scheduled ? now >= scheduled : false;

    let appointmentInfo = { days: 0, hours: 0, minutes: 0, totalMinutes: 0, isToday: true };
    let timeSlotLabel = '';
    let shouldLeaveNow = false;

    if (scheduled) {
      const diffMs = scheduled.getTime() - now.getTime();
      const totalMinutes = Math.floor(diffMs / 60000);
      const isToday = scheduled.toDateString() === now.toDateString();
      const days = Math.floor(totalMinutes / (24 * 60));
      const remainingAfterDays = totalMinutes % (24 * 60);
      const hours = Math.floor(remainingAfterDays / 60);
      const minutes = remainingAfterDays % 60;
      appointmentInfo = { totalMinutes, days, hours, minutes, isToday };
      timeSlotLabel = formatTimeSlot(scheduled);

      shouldLeaveNow =
        !isStarted &&
        isToday &&
        totalMinutes > 0 &&
        totalMinutes <= walkTime + 30;
    }

    // 等待时间：服务未开始按前方人数 × 服务时长；已开始按服务剩余时间
    const waitTime = isStarted ? this.data.remainingMinutes : (aheadCount === 0 ? 0 : aheadCount * serviceMinutes);

    this.setData({
      position,
      aheadCount,
      serviceMinutes,
      isStarted,
      appointmentInfo,
      timeSlotLabel,
      distance,
      walkTime,
      shouldLeaveNow,
      waitTime,
    });

    this.computeProgress();
  },

  computeProgress() {
    const { myBooking, isStarted } = this.data;
    if (!myBooking || !isStarted) {
      this.setData({
        currentStep: 0,
        stepProgress: 0,
        overallProgress: 0,
        remainingMinutes: 0,
      });
      return;
    }

    const scheduled = new Date(myBooking.scheduledTime);
    const elapsedMinutes = Math.floor((Date.now() - scheduled.getTime()) / 60000);
    const totalMinutes = serviceSteps.reduce((sum, s) => sum + s.duration, 0);

    let remaining = totalMinutes;
    let currentStep = 0;
    let completedMinutes = 0;

    for (let i = 0; i < serviceSteps.length; i++) {
      const step = serviceSteps[i];
      if (elapsedMinutes >= completedMinutes + step.duration) {
        completedMinutes += step.duration;
        currentStep = i + 1;
      } else if (elapsedMinutes >= completedMinutes) {
        currentStep = i;
        const stepProgress = Math.min(100, Math.floor(((elapsedMinutes - completedMinutes) / step.duration) * 100));
        this.setData({
          currentStep,
          stepProgress,
          overallProgress: Math.min(100, Math.floor((elapsedMinutes / totalMinutes) * 100)),
          remainingMinutes: Math.max(0, totalMinutes - elapsedMinutes),
        });
        return;
      }
      remaining -= step.duration;
    }

    this.setData({
      currentStep: Math.min(currentStep, serviceSteps.length - 1),
      stepProgress: 0,
      overallProgress: Math.min(100, Math.floor((elapsedMinutes / totalMinutes) * 100)),
      remainingMinutes: Math.max(0, totalMinutes - elapsedMinutes),
    });
  },

  startProgressTimer() {
    this.stopProgressTimer();
    this.progressTimer = setInterval(() => {
      if (this.data.isStarted) {
        this.computeProgress();
        this.refreshComputed();
      }
    }, 3000);
  },

  stopProgressTimer() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  },

  onRefresh() {
    this.loadQueue();
  },

  toggleReminder() {
    this.setData({ reminderEnabled: !this.data.reminderEnabled });
  },

  openMap() {
    const { shop } = this.data;
    if (!shop) return;
    if (shop.latitude && shop.longitude) {
      wx.openLocation({
        latitude: Number(shop.latitude),
        longitude: Number(shop.longitude),
        name: shop.name,
        address: shop.address,
      });
    } else {
      wx.showModal({ title: '店铺地址', content: shop.address || '地址未设置', showCancel: false });
    }
  },

  goToBooking() {
    wx.navigateTo({ url: '/pages/booking/booking' });
  },

  goToShop() {
    wx.navigateTo({ url: '/pages/index/index' });
  },

  formatTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${toTwoDigits(d.getHours())}:${toTwoDigits(d.getMinutes())}`;
  },

  formatDateTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${d.getMonth() + 1}月${d.getDate()}日 ${weekDays[d.getDay()]} ${toTwoDigits(d.getHours())}:${toTwoDigits(d.getMinutes())}`;
  },

  statusText(status) {
    const map = {
      pending: '待店铺确认',
      confirmed: '已确认',
      serving: '服务中',
      completed: '已完成',
      cancelled: '已取消',
    };
    return map[status] || status;
  },

  statusClass(status) {
    const map = {
      pending: 'status-pending',
      confirmed: 'status-confirmed',
      serving: 'status-serving',
      completed: 'status-completed',
      cancelled: 'status-cancelled',
    };
    return map[status] || 'status-pending';
  },
});
