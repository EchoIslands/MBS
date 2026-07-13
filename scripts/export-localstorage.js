/**
 * 浏览器端导出脚本
 * 用法：在管理端页面按 F12 打开控制台，把下面整段代码粘贴进去，回车。
 * 会自动下载一个 JSON 文件，包含 localStorage 中的客户、预约、结算等数据。
 */
(function exportLocalStorage() {
  const keys = [
    'mbs_customers_cache',
    'mbs_bookings_cache',
    'mbs_settlements_cache',
    'mbs_benefits_cache',
    'mbs_shops_cache',
    'mbs_queues_cache',
    'mbs_reviews_cache',
  ];

  const data = {};
  keys.forEach((key) => {
    const value = localStorage.getItem(key);
    if (value) {
      try {
        data[key] = JSON.parse(value);
      } catch (e) {
        data[key] = value;
      }
    }
  });

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mbs-localstorage-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('✅ 导出完成，包含以下数据：');
  Object.keys(data).forEach((key) => {
    const arr = Array.isArray(data[key]) ? data[key] : null;
    console.log(`  - ${key}: ${arr ? arr.length + ' 条' : '已导出'}`);
  });
})();
