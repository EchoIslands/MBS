Page({
  data: {
    bookingId: '',
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ bookingId: options.id });
    }
  },
});
