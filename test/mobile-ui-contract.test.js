'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'public/css/fluffy.css'), 'utf8');
const passwordHtml = fs.readFileSync(path.join(ROOT, 'public/password.html'), 'utf8');
const passwordJs = fs.readFileSync(path.join(ROOT, 'public/js/password-init.js'), 'utf8');

function extractMedia(source, query) {
  const marker = '@media (' + query + ')';
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, '缺少媒体查询：' + query);
  const openIndex = source.indexOf('{', markerIndex);
  let depth = 0;

  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
  }

  throw new Error('媒体查询未闭合：' + query);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

function extractFunctionBody(source, name) {
  const functionPattern = new RegExp(
    '\\bfunction\\s+' + escapeRegExp(name) + '\\s*\\([^)]*\\)\\s*\\{'
  );
  const functionMatch = functionPattern.exec(source);
  assert.ok(functionMatch, '缺少函数：' + name);
  const openIndex = source.indexOf('{', functionMatch.index);
  let depth = 0;

  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
  }

  throw new Error('函数未闭合：' + name);
}

function getFinalProperty(source, selector, property) {
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  let finalValue;

  while ((match = rulePattern.exec(source))) {
    const selectors = match[1].split(',').map(function (item) { return item.trim(); });
    if (selectors.indexOf(selector) === -1) continue;

    const propertyPattern = new RegExp(
      '(?:^|;)\\s*' + escapeRegExp(property) + '\\s*:\\s*([^;]+)',
      'g'
    );
    let propertyMatch;
    while ((propertyMatch = propertyPattern.exec(match[2]))) {
      finalValue = propertyMatch[1].trim();
    }
  }

  return finalValue;
}

const mobileCss = extractMedia(css, 'max-width: 680px');

test('密码输入使用 autofocus 并保留 JS focus 后备', function () {
  const inputTag = passwordHtml.match(/<input\b(?=[^>]*\bid="password-input")[^>]*>/i);
  const initBody = extractFunctionBody(passwordJs, 'init');
  assert.ok(inputTag, '缺少 #password-input');
  assert.match(inputTag[0], /\bautofocus\b/i);
  assert.match(initBody, /passwordInput\.focus\(\)/);
});

test('手机密码页只显示居中的密码卡', function () {
  assert.equal(getFinalProperty(mobileCss, '.password-intro', 'display'), 'none');
  assert.equal(getFinalProperty(mobileCss, '.password-artboard', 'align-items'), 'center');
  assert.equal(getFinalProperty(mobileCss, '.password-artboard', 'padding'), '16px 0');
});

test('手机浮动标题栏保持单行紧凑布局', function () {
  assert.equal(getFinalProperty(mobileCss, '.floating-header', 'flex-direction'), 'row');
  assert.equal(getFinalProperty(mobileCss, '.floating-header', 'align-items'), 'center');
  assert.equal(getFinalProperty(mobileCss, '.floating-header .eyebrow', 'display'), 'none');
  assert.equal(getFinalProperty(mobileCss, '.floating-header h1', 'white-space'), 'nowrap');
  assert.equal(getFinalProperty(mobileCss, '.header-actions', 'width'), 'auto');
  assert.equal(getFinalProperty(mobileCss, '.header-actions', 'flex-wrap'), 'nowrap');
});

test('手机登出按钮显示真实文字', function () {
  assert.equal(getFinalProperty(mobileCss, '.logout-button .logout-label', 'display'), 'inline');
  assert.equal(getFinalProperty(mobileCss, '.logout-button::before', 'content'), 'none');
});

test('手机卡片操作按钮默认可见且为标签预留空间', function () {
  assert.equal(getFinalProperty(mobileCss, '.card-actions', 'opacity'), '1');
  assert.equal(getFinalProperty(mobileCss, '.card-actions', 'transform'), 'translateY(0)');
  assert.equal(getFinalProperty(mobileCss, '.card-actions', 'pointer-events'), 'auto');
  assert.equal(
    getFinalProperty(mobileCss, '.list-card .tag-row', 'max-width'),
    'calc(100% - 116px)'
  );
});
