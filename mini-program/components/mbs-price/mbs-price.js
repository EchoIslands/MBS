Component({
  properties: {
    original: {
      type: [String, Number],
      value: '',
    },
    current: {
      type: [String, Number],
      value: '',
    },
    showTag: {
      type: Boolean,
      value: true,
    },
    size: {
      type: String,
      value: 'base',
    },
    align: {
      type: String,
      value: 'right',
    },
  },

  data: {
    hasDiscount: false,
    originalStr: '',
    currentStr: '',
  },

  observers: {
    'original, current': function (original, current) {
      const originalNum = Number(original) || 0;
      const currentNum = Number(current) || 0;
      const hasDiscount = currentNum > 0 && currentNum < originalNum;
      this.setData({
        hasDiscount,
        originalStr: originalNum.toFixed(2),
        currentStr: currentNum > 0 ? currentNum.toFixed(2) : originalNum.toFixed(2),
      });
    },
  },
});
