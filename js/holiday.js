/**
 * 节假日数据接入模块
 * 从节假日 API 获取数据并提供分组、高速免费判定等功能
 */

/**
 * 从 API 获取指定年份的节假日数据
 * @param {number} year - 年份
 * @returns {Promise<Array>} 节假日数据数组，失败时返回空数组
 */
async function fetchHolidays(year) {
  try {
    const response = await fetch(`https://api.jiejiariapi.com/v1/holidays/${year}`);
    if (!response.ok) {
      console.warn(`节假日 API 请求失败: ${response.status}`);
      return [];
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('节假日 API 调用异常:', error);
    return [];
  }
}

/**
 * 按节假日名称分组，取每个节假日的最早日期
 * @param {Array} raw - 原始节假日数据数组
 * @returns {Map<string, string>} Map<name, earliestDate>
 */
function groupByName(raw) {
  const grouped = new Map();

  for (const holiday of raw) {
    const { name, date } = holiday;
    if (!name || !date) continue;

    if (!grouped.has(name) || date < grouped.get(name)) {
      grouped.set(name, date);
    }
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
