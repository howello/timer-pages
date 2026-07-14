/**
 * 农历换算模块
 * 包裹 lunar-javascript 库，提供农历日期到公历日期的转换
 *
 * 注意：lunar-javascript 是 UMD 包，在浏览器环境下会把 Solar / Lunar 等
 * 各自挂到全局（window.Solar、window.Lunar），而不是 window.Lunar.Solar。
 * 因此这里直接使用顶级的 Solar / Lunar。
 * 闰月由负数月份表示（如 -6 表示闰六月），库没有 getLeapMonth() 实例方法。
 */
(function (window) {
  'use strict';

  /**
   * 获取库的 Solar / Lunar 顶级对象
   * @returns {{Solar: Object, Lunar: Object}|null}
   */
  function getLib() {
    var Solar = window.Solar || (typeof Solar !== 'undefined' ? Solar : null);
    var Lunar = window.Lunar || (typeof Lunar !== 'undefined' ? Lunar : null);
    if (!Solar || !Solar.fromYmd || !Lunar || !Lunar.fromYmd) return null;
    return { Solar: Solar, Lunar: Lunar };
  }

  /**
   * 获取指定农历日期对应的公历日期
   * @param {number} year - 期望落在的公历年份
   * @param {number} month - 农历月份（1-12）
   * @param {number} day - 农历日期（1-30）
   * @param {boolean} isLeap - 是否闰月
   * @returns {Date|null} 公历 Date 对象，该年份不存在该农历日期时返回 null
   */
  function getLunarDate(year, month, day, isLeap) {
    var lib = getLib();
    if (!lib) return null;

    try {
      // 由公历年份 1 月 1 日推算对应的农历年份
      var lunarYearAtStart = lib.Solar.fromYmd(year, 1, 1).getLunar().getYear();
      // 闰月用负数月份表示
      var m = isLeap ? -Math.abs(month) : Math.abs(month);

      // 农历年可能与公历年错位，向前后各探一年，取落在目标公历年的结果
      var candidates = [lunarYearAtStart, lunarYearAtStart - 1, lunarYearAtStart + 1];
      for (var i = 0; i < candidates.length; i++) {
        try {
          var lunar = lib.Lunar.fromYmd(candidates[i], m, day);
          var solar = lunar.getSolar();
          var date = new Date(solar.getYear(), solar.getMonth() - 1, solar.getDay(), 0, 0, 0, 0);
          if (date.getFullYear() === year) {
            return date;
          }
        } catch (inner) {
          // 该农历年不存在此（闰）月/日，继续尝试下一年
        }
      }
      return null;
    } catch (error) {
      console.warn('获取农历日期失败: ' + year + '年 ' + (isLeap ? '闰' : '') + month + '月' + day + '日', error);
      return null;
    }
  }

  /**
   * 计算下一次农历日期对应的公历日期（用于周期性农历事件）
   * @param {number} month - 农历月份（1-12），负数表示闰月
   * @param {number} day - 农历日期（1-30）
   * @param {boolean} [isLeap=false] - 是否闰月
   * @returns {Date} 下一次该农历日期对应的公历 Date 对象
   */
  function nextSolarOfLunar(month, day, isLeap) {
    isLeap = month < 0 || isLeap === true;
    var actualMonth = Math.abs(month);

    if (actualMonth < 1 || actualMonth > 12) {
      throw new Error('农历月份必须在 1-12 之间，当前值: ' + actualMonth);
    }
    if (day < 1 || day > 30) {
      throw new Error('农历日期必须在 1-30 之间，当前值: ' + day);
    }
    if (!getLib()) {
      throw new Error('lunar-javascript 库未加载');
    }

    var now = new Date();
    var startYear = now.getFullYear();

    // 从今年起向后探三年，取第一个不早于当前时刻的日期
    for (var y = startYear; y <= startYear + 2; y++) {
      var date = getLunarDate(y, actualMonth, day, isLeap);
      if (date && date >= now) {
        return date;
      }
    }

    throw new Error('无法找到农历 ' + (isLeap ? '闰' : '') + actualMonth + '月' + day + '日对应的未来公历日期');
  }

  // 导出函数
  window.LunarHelper = {
    nextSolarOfLunar: nextSolarOfLunar,
    getLunarDate: getLunarDate
  };
})(window);
