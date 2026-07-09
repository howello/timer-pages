/**
 * 农历换算模块
 * 包裹 lunar-javascript 库，提供农历日期到公历日期的转换
 */

/**
 * 计算下一次农历日期对应的公历日期
 * @param {number} month - 农历月份（1-12），负数表示闰月（如 -8 表示闰八月）
 * @param {number} day - 农历日期（1-30）
 * @param {boolean} isLeap - 是否闰月（已废弃，使用负数月份表示）
 * @returns {Date} 下一次该农历日期对应的公历 Date 对象
 */
function nextSolarOfLunar(month, day, isLeap = false) {
  if (typeof Lunar === 'undefined') {
    throw new Error('lunar-javascript 库未加载');
  }

  // 处理闰月：如果 month 为负数，表示闰月
  const isLeapMonth = month < 0 || isLeap;
  const actualMonth = Math.abs(month);

  // 验证参数
  if (actualMonth < 1 || actualMonth > 12) {
    throw new Error(`农历月份必须在 1-12 之间，当前值: ${actualMonth}`);
  }
  if (day < 1 || day > 30) {
    throw new Error(`农历日期必须在 1-30 之间，当前值: ${day}`);
  }

  const now = new Date();
  const currentYear = now.getFullYear();

  // 尝试当前年份
  let targetDate = getLunarDate(currentYear, actualMonth, day, isLeapMonth);

  // 如果目标日期早于今天，则尝试下一年
  if (targetDate && targetDate < now) {
    targetDate = getLunarDate(currentYear + 1, actualMonth, day, isLeapMonth);
  }

  // 如果还是找不到，再尝试下下一年（处理农历年不存在的情况）
  if (!targetDate || targetDate < now) {
    targetDate = getLunarDate(currentYear + 2, actualMonth, day, isLeapMonth);
  }

  if (!targetDate) {
    throw new Error(`无法找到农历 ${isLeapMonth ? '闰' : ''}${actualMonth}月${day}日对应的未来公历日期`);
  }

  return targetDate;
}

/**
 * 获取指定农历日期对应的公历日期
 * @param {number} year - 公历年份
 * @param {number} month - 农历月份（1-12）
 * @param {number} day - 农历日期（1-30）
 * @param {boolean} isLeap - 是否闰月
 * @returns {Date|null} 公历 Date 对象，如果该年份不存在该农历日期则返回 null
 */
function getLunarDate(year, month, day, isLeap) {
  try {
    // 使用 lunar-javascript 的 Lunar.fromYmd 方法
    // 注意：lunar-javascript 的年份是农历年份，需要从公历年份推算

    // 先获取公历年份对应的农历信息
    const solarDate = Lunar.Solar.fromYmd(year, 1, 1);
    const lunarYear = solarDate.getLunar().getYear();

    // 尝试当前农历年
    let lunar = tryGetLunar(lunarYear, month, day, isLeap);
    if (lunar) {
      const solar = lunar.getSolar();
      const date = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay(), 0, 0, 0, 0);
      if (date.getFullYear() === year) {
        return date;
      }
    }

    // 如果不在当前农历年，尝试前一年和后一年
    lunar = tryGetLunar(lunarYear - 1, month, day, isLeap);
    if (lunar) {
      const solar = lunar.getSolar();
      const date = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay(), 0, 0, 0, 0);
      if (date.getFullYear() === year) {
        return date;
      }
    }

    lunar = tryGetLunar(lunarYear + 1, month, day, isLeap);
    if (lunar) {
      const solar = lunar.getSolar();
      const date = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay(), 0, 0, 0, 0);
      if (date.getFullYear() === year) {
        return date;
      }
    }

    return null;
  } catch (error) {
    console.warn(`获取农历日期失败: ${year}年 ${isLeap ? '闰' : ''}${month}月${day}日`, error);
    return null;
  }
}

/**
 * 尝试获取农历日期对象
 * @param {number} lunarYear - 农历年份
 * @param {number} month - 农历月份
 * @param {number} day - 农历日期
 * @param {boolean} isLeap - 是否闰月
 * @returns {Lunar|null} Lunar 对象或 null
 */
function tryGetLunar(lunarYear, month, day, isLeap) {
  try {
    const lunar = Lunar.Lunar.fromYmd(lunarYear, month, day);

    // 验证闰月是否匹配
    if (isLeap && lunar.getMonth() !== month) {
      return null; // 不是闰月或月份不匹配
    }
    if (isLeap && !lunar.getLeapMonth()) {
      return null; // 不是闰月
    }
    if (!isLeap && lunar.getLeapMonth() && lunar.getMonth() === month) {
      return null; // 要求非闰月但获取到了闰月
    }

    return lunar;
  } catch (error) {
    return null;
  }
}

// 导出函数
window.LunarHelper = {
  nextSolarOfLunar,
  getLunarDate
};
