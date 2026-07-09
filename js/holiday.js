/**
 * 节假日数据接入模块
 * 通过 /api/holidays/{year} 代理获取数据
 */

/**
 * 从 API 获取指定年份的节假日数据
 * @param {number} year - 年份
 * @returns {Promise<Array>} 节假日数据数组，失败时返回空数组
 */
function fetchHolidays(year) {
  var targetYear = year || new Date().getFullYear();
  return fetch('/api/holidays/' + targetYear).then(function (response) {
    if (!response.ok) {
      console.warn('[holiday] API 请求失败: ' + response.status);
      return [];
    }
    return response.json();
  }).then(function (data) {
    // 将对象格式（如 {"2026-01-01": {...}}）转为数组
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      var arr = [];
      for (var dateKey in data) {
        if (data.hasOwnProperty(dateKey)) {
          arr.push({ date: dateKey, name: data[dateKey].name, isOffDay: data[dateKey].isOffDay });
        }
      }
      return arr;
    }
    return Array.isArray(data) ? data : [];
  }).catch(function (error) {
    console.warn('[holiday] API 调用异常:', error);
    return [];
  });
}

/**
 * 按节假日名称分组,取每个节假日的最早日期和isOffDay
 * @param {Array} raw - 原始节假日数据数组
 * @returns {Map<string, {date: string, isOffDay: boolean}>} Map<name, {date, isOffDay}>
 */
function groupByName(raw) {
  const grouped = new Map();

  for (const holiday of raw) {
    const { name, date, isOffDay } = holiday;
    if (!name || !date) continue;

    if (!grouped.has(name)) {
      grouped.set(name, { date, isOffDay: !!isOffDay });
      continue;
    }

    const current = grouped.get(name);
    if (date < current.date) {
      current.date = date;
    }
    current.isOffDay = current.isOffDay || !!isOffDay;
  }

  return grouped;
}

/**
 * 判断指定节假日是否高速免费
 * @param {string} name - 节假日名称
 * @returns {boolean} 是否高速免费
 */
function isHighwayFree(name) {
  const freeHolidays = ['春节', '清明节', '劳动节', '国庆节'];
  return freeHolidays.includes(name);
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fetchHolidays, groupByName, isHighwayFree };
}
