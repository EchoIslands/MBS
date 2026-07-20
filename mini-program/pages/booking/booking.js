import { getShop } from '../../api/shop';
import { createBooking, getBookingsByShop } from '../../api/booking';
import { getCustomerId } from '../../utils/storage';

// 与 H5 的 shared/types.ts 中 UserRole.STYLIST 保持一致
const STYLIST_ROLE = 'stylist';

// 生成未来7天日期
function generateDates() {
  const arr = [];
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    arr.push({
      value: dateStr,
      label: `${d.getMonth() + 1}月${d.getDate()}日`,
      weekDay: weekDays[d.getDay()],
    });
  }
  return arr;
}

// 生成时段
function generateTimeSlots(selectedDate) {
  const arr = [];
  for (let h = 9; h <= 20; h++) {
    arr.push(`${h.toString().padStart(2, '0')}:00`);
    arr.push(`${h.toString().padStart(2, '0')}:30`);
  }
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  if (selectedDate === todayStr) {
    const currentHour = today.getHours();
    const currentMinute = today.getMinutes();
    return arr.filter((time) => {
      const [h, m] = time.split(':').map(Number);
      if (h > currentHour) return true;
      if (h === currentHour && m > currentMinute) return true;
      return false;
    });
  }
  return arr;
}

// 判断是否为发型师
function isStylist(e) {
  if (e.role) return e.role === STYLIST_ROLE;
  const title = e.title || '';
  return /发型师|造型师|总监|设计师|老师|剪发|烫染|护理/.test(title);
}

// 根据 ID 找服务（供 WXML 展示用，小程序 WXML 不支持 .find）
function getServiceById(services, id) {
  if (!services || !id) return null;
  for (const s of services) {
    if (s.id === id) return s;
  }
  return null;
}

// 根据 value 找日期标签
function getDateLabel(dates, value) {
  if (!dates || !value) return '';
  for (const d of dates) {
    if (d.value === value) return d.label;
  }
  return '';
}

// 根据 ID 找发型师
function getBarberById(stylists, id) {
  if (!stylists || !id) return null;
  for (const s of stylists) {
    if (s.id === id) return s;
  }
  return null;
}

// 判断发型师是否忙碌
function isBarberBusy(barberId, date, time, bookings) {
  return bookings.some((bk) => {
    if (bk.status === 'cancelled') return false;
    if (bk.barberId !== barberId && bk.stylistId !== barberId) return false;
    const bkDate = new Date(bk.scheduledTime);
    return bkDate.toISOString().split('T')[0] === date
      && bkDate.toTimeString().slice(0, 5) === time;
  });
}

// 找最快可服务的发型师
function findFastestStylist(stylists, selectedDate, selectedTime, existingBookings) {
  if (!stylists || stylists.length === 0 || !selectedDate || !selectedTime) return null;
  let best = null;
  let minWait = Infinity;
  for (const barber of stylists) {
    if (isBarberBusy(barber.id, selectedDate, selectedTime, existingBookings)) continue;

    const sameDayBookings = existingBookings.filter((bk) => {
      if (bk.barberId !== barber.id && bk.stylistId !== barber.id) return false;
      if (bk.status === 'cancelled') return false;
      const bkDate = new Date(bk.scheduledTime);
      return bkDate.toISOString().split('T')[0] === selectedDate;
    });

    const ratingBonus = Math.min(10, ((barber.rating || 4.5) - 4) * 10);
    const waitTime = Math.max(0, sameDayBookings.length * 30 - Math.floor(ratingBonus));

    if (waitTime < minWait) {
      minWait = waitTime;
      best = barber;
    }
  }
  return best;
}

Page({
  data: {
    shop: null,
    loading: true,
    dates: generateDates(),
    selectedDate: generateDates()[0].value,
    selectedDateLabel: generateDates()[0].label,
    timeSlots: [],
    selectedTime: '',
    selectedService: '',
    selectedServiceName: '',
    selectedServicePrice: 0,
    stylists: [],
    selectedBarberId: '',
    selectedBarberName: '',
    selectionMode: 'fastest',
    notes: '',
    existingBookings: [],
    booking: false,
    customerId: '',
  },

  async onLoad(options) {
    const dates = generateDates();
    const selectedDate = dates[0].value;
    const timeSlots = generateTimeSlots(selectedDate);

    this.setData({
      dates,
      selectedDate,
      selectedDateLabel: getDateLabel(dates, selectedDate),
      timeSlots,
      selectedTime: timeSlots[0] || '',
      customerId: getCustomerId(),
    });

    await this.loadShop();

    if (options.serviceId) {
      const service = getServiceById(this.data.shop?.services || [], options.serviceId);
      this.setData({
        selectedService: options.serviceId,
        selectedServiceName: service?.name || '',
        selectedServicePrice: service?.price || 0,
      });
    }

    await this.loadBookings();
  },

  async loadShop() {
    this.setData({ loading: true });
    try {
      const shop = await getShop('shop1');
      if (shop) {
        const services = shop.services || [];
        const stylists = (shop.employees || []).filter((e) => isStylist(e) && e.isActive !== false);
        const selectedService = services.length > 0 ? services[0].id : '';
        const service = getServiceById(services, selectedService);
        this.setData({
          shop,
          stylists,
          selectedService,
          selectedServiceName: service?.name || '',
          selectedServicePrice: service?.price || 0,
          loading: false,
        });
      } else {
        this.setData({ loading: false });
        wx.showToast({ title: '店铺加载失败', icon: 'none' });
      }
    } catch (err) {
      console.error('加载店铺失败:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  async loadBookings() {
    const { shop, selectedDate } = this.data;
    if (!shop?.id || !selectedDate) return;
    try {
      const data = await getBookingsByShop(shop.id, selectedDate);
      this.setData({ existingBookings: data || [] });
    } catch (error) {
      console.error('加载店铺预约失败:', error);
      this.setData({ existingBookings: [] });
    }
  },

  onDateChange(e) {
    const selectedDate = this.data.dates[e.detail.value].value;
    const timeSlots = generateTimeSlots(selectedDate);
    this.setData({
      selectedDate,
      selectedDateLabel: getDateLabel(this.data.dates, selectedDate),
      timeSlots,
      selectedTime: timeSlots[0] || '',
    });
    this.loadBookings();
  },

  onTimeChange(e) {
    this.setData({ selectedTime: this.data.timeSlots[e.detail.value] });
  },

  onServiceChange(e) {
    const services = this.data.shop?.services || [];
    const service = services[e.detail.value];
    this.setData({
      selectedService: service?.id || '',
      selectedServiceName: service?.name || '',
      selectedServicePrice: service?.price || 0,
    });
  },

  onBarberChange(e) {
    const stylists = this.data.stylists;
    const barber = stylists[e.detail.value];
    this.setData({
      selectedBarberId: barber?.id || '',
      selectedBarberName: barber?.name || '',
      selectionMode: 'specific',
    });
  },

  onModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      selectionMode: mode,
      selectedBarberId: '',
      selectedBarberName: '',
    });
  },

  onNotesInput(e) {
    this.setData({ notes: e.detail.value });
  },

  getStylists() {
    return this.data.stylists || [];
  },

  getFastest() {
    const { selectedDate, selectedTime, existingBookings } = this.data;
    const stylists = this.getStylists();
    return findFastestStylist(stylists, selectedDate, selectedTime, existingBookings);
  },

  async handleBooking() {
    const { selectedService, selectedDate, selectedTime, selectionMode, selectedBarberId, notes, shop, customerId } = this.data;

    if (!selectedService || !selectedDate || !selectedTime) {
      wx.showToast({ title: '请填写完整预约信息', icon: 'none' });
      return;
    }
    if (!customerId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const stylists = this.getStylists();
    const target = selectionMode === 'specific'
      ? stylists.find((e) => e.id === selectedBarberId)
      : this.getFastest();

    if (!target) {
      wx.showToast({ title: '当前所选时间没有可用发型师，请更换时间', icon: 'none' });
      return;
    }

    this.setData({ booking: true });

    const scheduledTime = new Date(`${selectedDate}T${selectedTime}:00`);

    try {
      const newBooking = await createBooking({
        shopId: shop?.id || 'shop1',
        customerId,
        serviceId: selectedService,
        scheduledTime: scheduledTime.toISOString(),
        barberId: target.id,
        barberName: target.name,
        stylistId: target.id,
        stylistName: target.name,
        notes,
      });

      if (newBooking && newBooking.id) {
        wx.navigateTo({ url: `/pages/queue/queue?id=${newBooking.id}` });
      } else {
        wx.showToast({ title: '预约失败', icon: 'none' });
      }
    } catch (error) {
      console.error('预约失败:', error);
      wx.showToast({ title: '预约失败，请检查网络连接', icon: 'none' });
    } finally {
      this.setData({ booking: false });
    }
  },
});
