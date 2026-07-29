Component({
  properties: {
    status: {
      type: String,
      value: '',
    },
  },

  data: {
    label: '',
    className: '',
  },

  observers: {
    status: function (status) {
      const map = {
        pending: { label: '待确认', className: 'badge-pending' },
        confirmed: { label: '已确认', className: 'badge-confirmed' },
        serving: { label: '服务中', className: 'badge-serving' },
        completed: { label: '已完成', className: 'badge-completed' },
        cancelled: { label: '已取消', className: 'badge-cancelled' },
      };
      const item = map[status] || { label: status || '未知', className: 'badge-pending' };
      this.setData({ label: item.label, className: item.className });
    },
  },
});
