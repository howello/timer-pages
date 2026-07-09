/**
 * Node.js 环境下的时间计算核心测试
 * 测试纯计算逻辑，不依赖 lunar-javascript
 */

// 模拟 TimeCalc 模块的核心函数
const EventType = {
  COUNTDOWN: 'countdown',
  ELAPSED: 'elapsed',
  RECURRING: 'recurring',
  FESTIVAL: 'festival'
};

const DateSystem = {
  SOLAR: 'solar',
  LUNAR: 'lunar'
};

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

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function createDateSafe(year, month, day, hours, minutes, seconds) {
  if (month === 1 && day === 29) {
    if (!isLeapYear(year)) {
      while (!isLeapYear(year)) {
        year++;
      }
    }
  }
  return new Date(year, month, day, hours, minutes, seconds, 0);
}

function getNextAnniversary(originalDate) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const month = originalDate.getMonth();
  const day = originalDate.getDate();

  let anniversary = createDateSafe(
    currentYear,
    month,
    day,
    originalDate.getHours() || 0,
    originalDate.getMinutes() || 0,
    originalDate.getSeconds() || 0
  );

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

function diff(now, target) {
  if (!(now instanceof Date) || !(target instanceof Date)) {
    throw new Error('now 和 target 必须是 Date 对象');
  }

  const diffMs = target - now;
  const isPast = diffMs < 0;
  const absDiffMs = Math.abs(diffMs);

  const seconds = Math.floor((absDiffMs / 1000) % 60);
  const minutes = Math.floor((absDiffMs / (1000 * 60)) % 60);
  const hours = Math.floor((absDiffMs / (1000 * 60 * 60)) % 24);
  const days = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));

  return { days, hours, minutes, seconds, isPast };
}

// 测试框架
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    passed++;
  } else {
    console.error(`✗ ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`✓ ${message} (${actual})`);
    passed++;
  } else {
    console.error(`✗ ${message} - 期望: ${expected}, 实际: ${actual}`);
    failed++;
  }
}

console.log('========== 时间计算核心测试 ==========\n');

// 测试 1: 时间差计算（未来时间）
console.log('【测试 1】时间差计算 - 未来时间');
const now1 = new Date('2026-07-09T10:00:00');
const future1 = new Date('2026-07-10T12:30:45');
const diff1 = diff(now1, future1);
assertEqual(diff1.days, 1, '天数应为 1');
assertEqual(diff1.hours, 2, '小时应为 2');
assertEqual(diff1.minutes, 30, '分钟应为 30');
assertEqual(diff1.seconds, 45, '秒应为 45');
assertEqual(diff1.isPast, false, 'isPast 应为 false');
console.log();

// 测试 2: 时间差计算（过去时间）
console.log('【测试 2】时间差计算 - 过去时间');
const now2 = new Date('2026-07-09T10:00:00');
const past2 = new Date('2026-07-08T08:00:00');
const diff2 = diff(now2, past2);
assertEqual(diff2.days, 1, '天数应为 1');
assertEqual(diff2.hours, 2, '小时应为 2');
assertEqual(diff2.minutes, 0, '分钟应为 0');
assertEqual(diff2.seconds, 0, '秒应为 0');
assertEqual(diff2.isPast, true, 'isPast 应为 true');
console.log();

// 测试 3: 日期解析
console.log('【测试 3】日期解析');
const parsed1 = parseDate('2026-12-31T23:59:59');
assert(parsed1 instanceof Date, '字符串应解析为 Date');
assertEqual(parsed1.getFullYear(), 2026, '年份应为 2026');
assertEqual(parsed1.getMonth(), 11, '月份应为 11（12月）');
assertEqual(parsed1.getDate(), 31, '日期应为 31');

const parsed2 = parseDate(new Date('2025-01-01'));
assert(parsed2 instanceof Date, 'Date 对象应直接返回');
console.log();

// 测试 4: 周年日计算
console.log('【测试 4】周年日计算');
const birthday = new Date('1990-05-15T00:00:00');
const nextBirthday = getNextAnniversary(birthday);
const now4 = new Date();
assert(nextBirthday > now4, '周年日应在未来');
assertEqual(nextBirthday.getMonth(), 4, '月份应为 4（5月）');
assertEqual(nextBirthday.getDate(), 15, '日期应为 15');
const expectedYear = now4.getMonth() > 4 || (now4.getMonth() === 4 && now4.getDate() > 15)
  ? now4.getFullYear() + 1
  : now4.getFullYear();
assertEqual(nextBirthday.getFullYear(), expectedYear, `年份应为 ${expectedYear}`);
console.log();

// 测试 5: 跨天计算精确性
console.log('【测试 5】跨天计算精确性');
const now5 = new Date('2026-01-01T23:00:00');
const target5 = new Date('2026-01-02T01:30:15');
const diff5 = diff(now5, target5);
assertEqual(diff5.days, 0, '天数应为 0（不足 24 小时）');
assertEqual(diff5.hours, 2, '小时应为 2');
assertEqual(diff5.minutes, 30, '分钟应为 30');
assertEqual(diff5.seconds, 15, '秒应为 15');
console.log();

// 测试 6: 大时间跨度
console.log('【测试 6】大时间跨度');
const now6 = new Date('2020-01-01T00:00:00');
const target6 = new Date('2026-07-09T12:00:00');
const diff6 = diff(now6, target6);
assert(diff6.days > 2000, `天数应大于 2000，实际: ${diff6.days}`);
assertEqual(diff6.hours, 12, '小时应为 12');
assertEqual(diff6.minutes, 0, '分钟应为 0');
assertEqual(diff6.seconds, 0, '秒应为 0');
console.log();

// 测试 7: 同一时刻
console.log('【测试 7】同一时刻');
const now7 = new Date('2026-07-09T12:00:00');
const target7 = new Date('2026-07-09T12:00:00');
const diff7 = diff(now7, target7);
assertEqual(diff7.days, 0, '天数应为 0');
assertEqual(diff7.hours, 0, '小时应为 0');
assertEqual(diff7.minutes, 0, '分钟应为 0');
assertEqual(diff7.seconds, 0, '秒应为 0');
console.log();

// 测试 8: 闰年 2 月 29 日
console.log('【测试 8】闰年 2 月 29 日周年计算');
const leapDay = new Date('2024-02-29T00:00:00');
const nextLeapDay = getNextAnniversary(leapDay);
assert(nextLeapDay instanceof Date, '应返回有效 Date');
assertEqual(nextLeapDay.getMonth(), 1, '月份应为 1（2月）');
assertEqual(nextLeapDay.getDate(), 29, '日期应为 29');
assert(nextLeapDay.getFullYear() >= 2028, `年份应 >= 2028，实际: ${nextLeapDay.getFullYear()}`);
assert(isLeapYear(nextLeapDay.getFullYear()), `${nextLeapDay.getFullYear()} 应该是闰年`);
console.log();

// 汇总
console.log('========== 测试汇总 ==========');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}`);
console.log(`通过率: ${((passed / (passed + failed)) * 100).toFixed(2)}%`);

process.exit(failed > 0 ? 1 : 0);
