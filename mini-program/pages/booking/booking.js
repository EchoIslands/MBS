import { getShop } from '../../api/shop';
import { createBooking, getBookingsByShop } from '../../api/booking';
import { getCustomerPublic } from '../../api/customer';
import { getCustomerId, setRouteParams, takeRouteParams } from '../../utils/storage';
import { calcDiscountedItemPrice } from '../../utils/membership';

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

// 根据 ID 找服务
function getServiceById(services, id) {
  if (!services || !id) return null;
  for (const s of services) {
    if (s.id === id) return s;
  }
  return null;
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
    error: '',
    dates: generateDates(),
    selectedDate: generateDates()[0].value,
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
    showLogin: false,
    fastest: null,
    fastestWaitTime: 0,
    customer: null,
    showServiceScrollbar: false,
    serviceThumbTop: 0,
    serviceThumbHeight: 40,
    serviceScrollbarClientHeight: 0,
  },

  async onLoad(options) {
    const dates = generateDates();
    const selectedDate = dates[0].value;
    const timeSlots = generateTimeSlots(selectedDate);

    const routeParams = takeRouteParams();
    const serviceId = options.serviceId || (routeParams && routeParams.serviceId);

    this.setData({
      dates,
      selectedDate,
      timeSlots: timeSlots.map((t) => ({ time: t, full: false })),
      selectedTime: timeSlots[0] || '',
      customerId: getCustomerId(),
    });

    await Promise.all([this.loadShop(), this.loadCustomer()]);

    // 顾客信息加载完成后，重新计算服务会员价（修复 loadShop/loadCustomer 竞态）
    this.refreshServicesWithCustomer();

    if (serviceId) {
      const service = getServiceById(this.data.shop?.services || [], serviceId);
      this.setData({
        selectedService: serviceId,
        selectedServiceName: service?.name || '',
        selectedServicePrice: service?.memberPrice ?? service?.price ?? 0,
      });
    }

    await this.loadBookings();
  },

  async onShow() {
    const routeParams = takeRouteParams();
    const serviceId = routeParams && routeParams.serviceId;
    if (serviceId && serviceId !== this.data.selectedService) {
      const service = getServiceById(this.data.shop?.services || [], serviceId);
      this.setData({
        selectedService: serviceId,
        selectedServiceName: service?.name || '',
        selectedServicePrice: service?.memberPrice ?? service?.price ?? 0,
      });
    }
  },

  async loadShop() {
    this.setData({ loading: true, error: '' });
    try {
      const shop = await getShop('shop1');
      if (shop) {
        const services = this.enrichServices(shop.services || []);
        const rawStylists = (shop.employees || []).filter((e) => isStylist(e) && e.isActive !== false);
        const selectedService = services.length > 0 ? services[0].id : '';
        const service = getServiceById(services, selectedService);
        this.setData({
          shop: { ...shop, services },
          selectedService,
          selectedServiceName: service?.name || '',
          selectedServicePrice: service?.memberPrice ?? service?.price ?? 0,
          loading: false,
        }, () => {
          this.updateServiceScrollbar();
        });
        this.updateStylists(rawStylists);
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

  async loadCustomer({ prefetchedCustomer = null } = {}) {
    const customerId = getCustomerId();
    if (!customerId) {
      this.setData({ customer: null });
      return;
    }
    try {
      // 登录接口已返回完整顾客信息，优先直接使用，避免生产环境 /customers/:id/public 偶发 401 阻塞登录流程
      const customer = prefetchedCustomer || await getCustomerPublic(customerId);
      this.setData({ customer });
    } catch (err) {
      console.error('[booking] 加载顾客信息失败:', err);
      this.setData({ customer: null });
    }
  },

  enrichServices(services) {
    const { customer } = this.data;
    return services.map((s) => {
      const originalPrice = Number(s.price) || 0;
      const memberPrice = calcDiscountedItemPrice(originalPrice, customer, 'service');
      const hasDiscount = memberPrice < originalPrice;
      return {
        ...s,
        originalPrice,
        memberPrice,
        hasDiscount,
        originalPriceStr: originalPrice.toFixed(2),
        priceStr: memberPrice.toFixed(2),
      };
    });
  },

  // 顾客信息加载完成后重新 enrich 服务价格，并刷新滑块尺寸
  refreshServicesWithCustomer() {
    const { shop, selectedService } = this.data;
    if (!shop) return;
    const services = this.enrichServices(shop.services || []);
    const service = getServiceById(services, selectedService) || services[0] || null;
    this.setData({
      shop: { ...shop, services },
      selectedService: service?.id || '',
      selectedServiceName: service?.name || '',
      selectedServicePrice: service?.memberPrice ?? service?.price ?? 0,
    }, () => {
      this.updateServiceScrollbar();
    });
  },

  // 计算并显示服务列表自定义滚动条
  updateServiceScrollbar() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#serviceScroll').boundingClientRect();
    query.select('#serviceScroll').scrollOffset();
    query.exec((res) => {
      if (!res || !res[0] || !res[1]) return;
      const rect = res[0];
      const scroll = res[1];
      const clientHeight = rect.height;
      const scrollHeight = scroll.scrollHeight;
      const needsSlider = scrollHeight > clientHeight + 2;
      const thumbHeight = Math.max(24, clientHeight * (clientHeight / scrollHeight));
      this.setData({
        showServiceScrollbar: needsSlider,
        serviceThumbHeight: thumbHeight,
        serviceThumbTop: 0,
        serviceScrollbarClientHeight: clientHeight,
      });
    });
  },

  // 滚动时同步更新自定义滑块位置
  onServiceScroll(e) {
    if (this._serviceScrollLock) return;
    this._serviceScrollLock = true;
    requestAnimationFrame(() => {
      this._serviceScrollLock = false;
      const { scrollTop, scrollHeight } = e.detail;
      const { serviceScrollbarClientHeight, serviceThumbHeight } = this.data;
      const clientHeight = serviceScrollbarClientHeight;
      if (!clientHeight || scrollHeight <= clientHeight) return;
      const maxThumbTop = Math.max(0, clientHeight - serviceThumbHeight);
      const ratio = Math.max(0, Math.min(1, scrollTop / (scrollHeight - clientHeight)));
      this.setData({ serviceThumbTop: ratio * maxThumbTop });
    });
  },

  updateStylists(rawStylists) {
    const { selectedDate, selectedTime, existingBookings } = this.data;
    const stylists = rawStylists.map((s) => {
      const isAvailable = !isBarberBusy(s.id, selectedDate, selectedTime, existingBookings);
      const sameDayBookings = existingBookings.filter((bk) => {
        if (bk.barberId !== s.id && bk.stylistId !== s.id) return false;
        if (bk.status === 'cancelled') return false;
        const bkDate = new Date(bk.scheduledTime);
        return bkDate.toISOString().split('T')[0] === selectedDate;
      });
      const ratingBonus = Math.min(10, ((s.rating || 4.5) - 4) * 10);
      const waitTime = Math.max(0, sameDayBookings.length * 30 - Math.floor(ratingBonus));
      return {
        ...s,
        isAvailable,
        waitTime,
        displayRating: (s.skillValue || s.rating || 4.5).toFixed(1),
        tagsDisplay: (s.tags || []).slice(0, 2),
      };
    });

    const fastest = findFastestStylist(rawStylists, selectedDate, selectedTime, existingBookings);
    this.setData({
      stylists,
      fastest,
      fastestWaitTime: fastest ? stylists.find((s) => s.id === fastest.id)?.waitTime || 0 : 0,
    });
  },

  async loadBookings() {
    const { shop, selectedDate } = this.data;
    if (!shop?.id || !selectedDate) return;
    try {
      const data = await getBookingsByShop(shop.id, selectedDate);
      this.setData({ existingBookings: data || [] });
      this.updateStylists((shop.employees || []).filter((e) => isStylist(e) && e.isActive !== false));
      this.updateTimeSlots();
    } catch (error) {
      console.error('加载店铺预约失败:', error);
      this.setData({ existingBookings: [] });
    }
  },

  updateTimeSlots() {
    const { selectedDate, selectedTime, stylists, existingBookings } = this.data;
    const rawSlots = generateTimeSlots(selectedDate);
    const timeSlots = rawSlots.map((time) => {
      const allBusy = stylists.length > 0 && stylists.every((s) => isBarberBusy(s.id, selectedDate, time, existingBookings));
      return { time, full: allBusy };
    });
    const stillValid = rawSlots.includes(selectedTime);
    this.setData({
      timeSlots,
      selectedTime: stillValid ? selectedTime : (rawSlots[0] || ''),
    });
  },

  onServiceSelect(e) {
    const id = e.currentTarget.dataset.id;
    const service = getServiceById(this.data.shop?.services || [], id);
    this.setData({
      selectedService: id,
      selectedServiceName: service?.name || '',
      selectedServicePrice: service?.memberPrice ?? service?.price ?? 0,
    });
  },

  onDateSelect(e) {
    const selectedDate = e.currentTarget.dataset.value;
    const timeSlots = generateTimeSlots(selectedDate);
    this.setData({
      selectedDate,
      timeSlots: timeSlots.map((t) => ({ time: t, full: false })),
      selectedTime: timeSlots[0] || '',
    });
    this.loadBookings();
  },

  onTimeSelect(e) {
    const time = e.currentTarget.dataset.value;
    const item = this.data.timeSlots.find((t) => t.time === time);
    if (item && item.full) return;
    this.setData({ selectedTime: time });
    this.updateStylists((this.data.shop?.employees || []).filter((e) => isStylist(e) && e.isActive !== false));
  },

  onModeSelect(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      selectionMode: mode,
      selectedBarberId: '',
      selectedBarberName: '',
    });
  },

  onBarberSelect(e) {
    const id = e.currentTarget.dataset.id;
    const barber = getBarberById(this.data.stylists, id);
    if (!barber || !barber.isAvailable) return;
    this.setData({
      selectionMode: 'specific',
      selectedBarberId: barber.id,
      selectedBarberName: barber.name,
    });
  },

  onNotesInput(e) {
    this.setData({ notes: e.detail.value });
  },

  async handleBooking() {
    const { selectedService, selectedDate, selectedTime, customerId } = this.data;

    if (!selectedService || !selectedDate || !selectedTime) {
      wx.showToast({ title: '请填写完整预约信息', icon: 'none' });
      return;
    }
    if (!customerId) {
      this.setData({ showLogin: true });
      return;
    }

    await this.doBooking();
  },

  async doBooking() {
    const { selectedService, selectedDate, selectedTime, selectionMode, selectedBarberId, notes, shop, customerId, stylists } = this.data;

    const target = selectionMode === 'specific'
      ? stylists.find((e) => e.id === selectedBarberId)
      : this.data.fastest;

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
        setRouteParams({ bookingId: newBooking.id });
        wx.redirectTo({ url: '/pages/queue/queue' });
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

  onLoginClose() {
    this.setData({ showLogin: false });
  },

  async onLoginSuccess(e) {
    const loggedInCustomer = e.detail && e.detail.customer;
    this.setData({ showLogin: false, customerId: getCustomerId() });
    wx.showToast({ title: '登录成功', icon: 'success' });
    await this.loadCustomer({ prefetchedCustomer: loggedInCustomer });
    this.refreshServicesWithCustomer();
    await this.doBooking();
  },

  goToShop() {
    wx.navigateTo({ url: '/pages/index/index' });
  },
});
