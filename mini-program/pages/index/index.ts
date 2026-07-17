import { getApiBase } from '../../../shared/api-base';

Page({
  data: {
    apiBase: '',
    notice: '欢迎来到 MBS',
  },

  onLoad() {
    this.setData({
      apiBase: getApiBase(),
    });
  },

  goToBooking() {
    wx.switchTab({ url: '/pages/booking/booking' });
  },
});
