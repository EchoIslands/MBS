Page({
  data: {
    bookingId: '',
  },

  onLoad(options) {
    if (options.bookingId) {
      this.setData({ bookingId: options.bookingId });
    }
  },
});
