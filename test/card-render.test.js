'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE_PATH = path.resolve(__dirname, '../public/js/card-render.js');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');
const NOW = '2026-07-15T12:00:00.000Z';

function loadCardRender(nowIso) {
  const fixedNow = nowIso || NOW;

  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [fixedNow]));
    }

    static now() {
      return new Date(fixedNow).getTime();
    }
  }

  const timeCalc = {
    shouldHideCard: function () { return false; },
    shouldShowDayCount: function () { return true; },
    resolveTargetDate: function (card) {
      return new FixedDate(card.target);
    },
    diff: function (now, target) {
      const diffMs = target - now;
      const absDiffMs = Math.abs(diffMs);
      return {
        days: Math.floor(absDiffMs / 86400000),
        hours: Math.floor((absDiffMs / 3600000) % 24),
        minutes: Math.floor((absDiffMs / 60000) % 60),
        seconds: Math.floor((absDiffMs / 1000) % 60),
        isPast: diffMs < 0
      };
    }
  };

  const context = {
    window: null,
    Date: FixedDate,
    console: console,
    setInterval: setInterval,
    clearInterval: clearInterval
  };
  context.window = context;
  context.TimeCalc = timeCalc;

  vm.runInNewContext(SOURCE, context, { filename: SOURCE_PATH });
  return context.CardRender;
}

test('过去的已过天数置顶项固定为首屏第一行', function () {
  const cardRender = loadCardRender();
  const moments = cardRender.getHeroMoments([
    { id: 'future', type: 'countdown', target: '2026-07-20T12:00:00.000Z' },
    { id: 'elapsed-pinned', type: 'elapsed', target: '2026-07-10T12:00:00.000Z', pinned: true }
  ]);

  assert.deepEqual(Array.from(moments, function (item) { return item.card.id; }), [
    'elapsed-pinned',
    'future'
  ]);
  assert.equal(moments[0].isPinned, true);
});

test('已到期倒计时置顶项固定为首屏第一行', function () {
  const cardRender = loadCardRender();
  const moments = cardRender.getHeroMoments([
    { id: 'expired-pinned', type: 'countdown', target: '2026-07-14T12:00:00.000Z', pinned: true },
    { id: 'future', type: 'countdown', target: '2026-07-16T12:00:00.000Z' }
  ]);

  assert.equal(moments[0].card.id, 'expired-pinned');
  assert.equal(moments[0].isPinned, true);
});

test('未来置顶项仍优先于日期更近的普通事件', function () {
  const cardRender = loadCardRender();
  const moments = cardRender.getHeroMoments([
    { id: 'near', type: 'countdown', target: '2026-07-16T12:00:00.000Z' },
    { id: 'pinned-later', type: 'countdown', target: '2026-08-01T12:00:00.000Z', pinned: true }
  ]);

  assert.deepEqual(Array.from(moments, function (item) { return item.card.id; }), [
    'pinned-later',
    'near'
  ]);
});

test('未置顶的过去事件仍不进入首屏候选', function () {
  const cardRender = loadCardRender();
  const moments = cardRender.getHeroMoments([
    { id: 'past', type: 'elapsed', target: '2026-07-10T12:00:00.000Z' },
    { id: 'future', type: 'countdown', target: '2026-07-16T12:00:00.000Z' }
  ]);

  assert.deepEqual(Array.from(moments, function (item) { return item.card.id; }), ['future']);
});

test('过去置顶项按天、小时、分钟和刚刚显示', function () {
  const cardRender = loadCardRender();
  const cases = [
    ['2026-07-13T12:00:00.000Z', '2', '天前'],
    ['2026-07-15T10:00:00.000Z', '2', '小时前'],
    ['2026-07-15T11:55:00.000Z', '5', '分钟前'],
    ['2026-07-15T11:59:30.000Z', '刚刚', '']
  ];

  cases.forEach(function (item) {
    const result = cardRender.formatMomentCountdown({
      id: 'past',
      type: 'countdown',
      target: item[0],
      pinned: true
    });
    assert.equal(result.number, item[1]);
    assert.equal(result.label, item[2]);
  });
});

test('未来文案保持天后语义', function () {
  const cardRender = loadCardRender();
  const result = cardRender.formatMomentCountdown({
    id: 'future',
    type: 'countdown',
    target: '2026-07-17T12:00:00.000Z'
  });

  assert.equal(result.number, '2');
  assert.equal(result.label, '天后');
});
