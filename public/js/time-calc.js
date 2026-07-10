/**
 * 时间计算核心模块
 * 提供纯函数实现的时间计算功能，支持 4 类事件类型
 */

/**
 * 事件类型枚举
 * - countdown: 倒计时（目标未来）
 * - elapsed: 正计时（已过天数）
 * - recurring: 周期性（如每年生日，求下次发生日）
 * - festival: 节日（外部传入最早日）
 */
const EventType = {
  COUNTDOWN: 'countdown',
  ELAPSED: 'elapsed',
  RECURRING: 'recurring',
  FESTIVAL: 'festival'
};

/**
 * 日期体系枚举
 * - solar: 公历
 * - lunar: 农历
 */
const DateSystem = {
  SOLAR: 'solar',
  LUNAR: 'lunar'
};

/**
 * 归约任意事件为公历目标时刻
 * @param {Object} event - 事件对象
 * @param {string} event.type - 事件类型 (countdown|elapsed|recurring|festival)
 * @param {string} event.dateSystem - 日期体系 (solar|lunar)
 * @param {string|Date} event.date - 事件日期（公历）
 * @param {number} [event.lunarMonth] - 农历月份（1-12，负数表示闰月）
 * @param {number} [event.lunarDay] - 农历日期（1-30）
 * @param {boolean} [event.isLeapMonth] - 是否闰月
 * @returns {Date} 目标公历日期
 */
function resolveTargetDate(event) {
  if (!event || !event.type) {
    throw new Error('事件对象必须包含 type 字段');
  }

  const type = event.type;
  const dateSystem = event.calendar || event.dateSystem || DateSystem.SOLAR;

  switch (type) {
    case EventType.COUNTDOWN:
      // 倒计时：公历直接使用 event.date；农历先换算为对应公历日
      if (dateSystem === DateSystem.LUNAR) {
        return resolveSpecificLunarDate(event);
      }
      return parseEventSolarDate(event);

    case EventType.ELAPSED:
      // 正计时：公历直接使用 event.date；农历先换算为对应公历日
      if (dateSystem === DateSystem.LUNAR) {
        return resolveSpecificLunarDate(event);
      }
      return parseEventSolarDate(event);

    case EventType.RECURRING:
      // 周期性事件：根据日期体系求下次发生日
      if (dateSystem === DateSystem.LUNAR) {
        // 农历周期性事件：调用 nextSolarOfLunar 求下次公历日
        if (!window.LunarHelper || !window.LunarHelper.nextSolarOfLunar) {
          throw new Error('农历转换模块未加载');
        }

        const month = event.lunarMonth || 1;
        const day = event.lunarDay || 1;
        const isLeap = event.isLeapMonth || false;

        return window.LunarHelper.nextSolarOfLunar(month, day, isLeap);
      } else {
        // 公历周期性事件：求下次周年日
        return getNextAnniversary(parseDate(event.date));
      }

    case EventType.FESTIVAL:
      // 节日：外部传入最早日（已经计算好的日期）
      return parseDate(event.date);

    default:
      throw new Error(`不支持的事件类型: ${type}`);
  }
}

/**
 * 将指定农历年月日换算为公历日期
 * countdown/elapsed 使用固定农历年份，不做下一次滚动
 * @param {Object} event
 * @returns {Date}
 */
function resolveSpecificLunarDate(event) {
  if (!window.LunarHelper || !window.LunarHelper.getLunarDate) {
    throw new Error('农历转换模块未加载');
  }

  const year = event.lunarYear || new Date().getFullYear();
  const month = event.lunarMonth || 1;
  const day = event.lunarDay || 1;
  const isLeap = event.isLeapMonth || false;
  const date = window.LunarHelper.getLunarDate(year, month, day, isLeap);

  if (!date) {
    throw new Error(`无法换算农历 ${year} 年 ${isLeap ? '闰' : ''}${month} 月 ${day} 日`);
  }

  if (event.time) {
    const parts = event.time.split(':');
    date.setHours(parseInt(parts[0] || '0', 10), parseInt(parts[1] || '0', 10), 0, 0);
  }

  return date;
}

/**
 * 计算时间差
 * @param {Date} now - 当前时间
 * @param {Date} target - 目标时间
 * @returns {Object} 时间差对象 {days, hours, minutes, seconds, isPast}
 */
function diff(now, target) {
  if (!(now instanceof Date) || !(target instanceof Date)) {
    throw new Error('now 和 target 必须是 Date 对象');
  }

  const diffMs = target - now;
  const isPast = diffMs < 0;
  const absDiffMs = Math.abs(diffMs);

  // 计算天、时、分、秒
  const seconds = Math.floor((absDiffMs / 1000) % 60);
  const minutes = Math.floor((absDiffMs / (1000 * 60)) % 60);
  const hours = Math.floor((absDiffMs / (1000 * 60 * 60)) % 24);
  const days = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));

  return {
    days,
    hours,
    minutes,
    seconds,
    isPast
  };
}

/**
 * 解析事件公历日期，并合并 event.time
 * @param {Object} event
 * @returns {Date}
 */
function parseEventSolarDate(event) {
  const date = parseDate(event.date);
  if (event.time) {
    const parts = event.time.split(':');
    date.setHours(parseInt(parts[0] || '0', 10), parseInt(parts[1] || '0', 10), 0, 0);
  }
  return date;
}

/**
 * 解析日期字符串或 Date 对象为 Date
 * @param {string|Date} dateInput - 日期输入
 * @returns {Date} Date 对象
 */
function parseDate(dateInput) {
  if (dateInput instanceof Date) {
    return dateInput;
  }

  if (typeof dateInput === 'string') {
    const parsed = new Date(dateInput);
    if (isNaN(parsed.getTime())) {
      throw new Error(`无效的日期字符串: ${dateInput}`);
    }
    return parsed;
  }

  throw new Error('日期必须是 Date 对象或日期字符串');
}

/**
 * 获取下次周年日（公历）
 * @param {Date} originalDate - 原始日期
 * @returns {Date} 下次周年日
 */
function getNextAnniversary(originalDate) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const month = originalDate.getMonth();
  const day = originalDate.getDate();

  // 尝试当前年份
  let anniversary = createDateSafe(
    currentYear,
    month,
    day,
    originalDate.getHours() || 0,
    originalDate.getMinutes() || 0,
    originalDate.getSeconds() || 0
  );

  // 如果已经过了，使用下一年
  if (anniversary <= now) {
    anniversary = createDateSafe(
      currentYear + 1,
      month,
      day,
      originalDate.getHours() || 0,
      originalDate.getMinutes() || 0,
      originalDate.getSeconds() || 0
    );
  }

  return anniversary;
}

/**
 * 安全创建日期，处理闰年 2 月 29 日的情况
 * @param {number} year - 年份
 * @param {number} month - 月份（0-11）
 * @param {number} day - 日期
 * @param {number} hours - 小时
 * @param {number} minutes - 分钟
 * @param {number} seconds - 秒
 * @returns {Date} Date 对象
 */
function createDateSafe(year, month, day, hours, minutes, seconds) {
  // 特殊处理 2 月 29 日
  if (month === 1 && day === 29) {
    // 检查目标年份是否是闰年
    if (!isLeapYear(year)) {
      // 如果不是闰年，找到下一个闰年
      while (!isLeapYear(year)) {
        year++;
      }
    }
  }

  return new Date(year, month, day, hours, minutes, seconds, 0);
}

/**
 * 判断是否是闰年
 * @param {number} year - 年份
 * @returns {boolean} 是否是闰年
 */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * 格式化时间差为字符串
 * @param {Object} timeDiff - diff 函数返回的时间差对象
 * @param {string} mode - 显示模式 ('full'|'compact')
 * @returns {string} 格式化的时间字符串
 */
function formatTimeDiff(timeDiff, mode = 'full') {
  const { days, hours, minutes, seconds, isPast } = timeDiff;

  if (mode === 'compact') {
    // 紧凑模式：只显示最大单位
    if (days > 0) {
      return `${days}天`;
    } else if (hours > 0) {
      return `${hours}小时`;
    } else if (minutes > 0) {
      return `${minutes}分钟`;
    } else {
      return `${seconds}秒`;
    }
  } else {
    // 完整模式：显示所有单位
    const parts = [];
    if (days > 0) parts.push(`${days}天`);
    if (hours > 0) parts.push(`${hours}小时`);
    if (minutes > 0) parts.push(`${minutes}分钟`);
    parts.push(`${seconds}秒`);
    return parts.join(' ');
  }
}

// 导出函数
window.TimeCalc = {
  EventType,
  DateSystem,
  resolveTargetDate,
  diff,
  parseDate,
  getNextAnniversary,
  formatTimeDiff,
  isLeapYear,
  createDateSafe
};
