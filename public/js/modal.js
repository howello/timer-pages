/**
 * 新增/编辑弹窗模块
 * 支持 4 类事件 + 公历/农历分段控件切换
 */
(function (window) {
  'use strict';

  var backdrop = null;
  var form = null;
  var currentEditEvent = null;
  var submitCallback = null;
  var fields = {};

  function ensureElements() {
    if (backdrop) return;
    backdrop = document.getElementById('modal-backdrop');
    form = document.getElementById('event-form');

    if (form) {
      var inputs = form.querySelectorAll('input, select, textarea');
      inputs.forEach(function (el) {
        if (el.name) fields[el.name] = el;
      });

      // 分段控件（公历/农历切换）
      var segOptions = document.querySelectorAll('.seg-option');
      segOptions.forEach(function (btn) {
        btn.addEventListener('click', function () {
          segOptions.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          toggleCalendarFields(btn.getAttribute('data-value') === 'lunar');
        });
      });

      form.addEventListener('submit', handleSubmit);

      var cancelBtn = document.getElementById('cancel-btn');
      if (cancelBtn) cancelBtn.addEventListener('click', close);

      var closeBtn = document.getElementById('close-modal-btn');
      if (closeBtn) closeBtn.addEventListener('click', close);

      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) close();
      });
    }

    var titleEl = document.getElementById('modal-title');
    if (titleEl) fields._title = titleEl;
  }

  function notify(message) {
    if (window.UIAlert && window.UIAlert.alert) {
      window.UIAlert.alert(message, { title: '提示' });
    } else {
      window.alert(message);
    }
  }

  function toggleCalendarFields(isLunar) {
    var solarFields = document.querySelectorAll('.solar-field');
    var lunarFields = document.querySelectorAll('.lunar-field');
    solarFields.forEach(function (el) { el.style.display = isLunar ? 'none' : ''; });
    lunarFields.forEach(function (el) { el.style.display = isLunar ? '' : 'none'; });
  }

  function show() {
    ensureElements();
    if (!backdrop) return;
    backdrop.style.display = 'grid';
  }

  function close() {
    if (!backdrop) return;
    backdrop.style.display = 'none';
    currentEditEvent = null;
    if (form) form.reset();
    var solarBtns = document.querySelectorAll('.seg-option');
    solarBtns.forEach(function (b, i) { b.classList.toggle('active', i === 0); });
    toggleCalendarFields(false);
  }

  function openCreate() {
    ensureElements();
    currentEditEvent = null;
    if (fields._title) fields._title.textContent = '新增事件';
    if (form) form.reset();
    var solarBtns = document.querySelectorAll('.seg-option');
    solarBtns.forEach(function (b, i) { b.classList.toggle('active', i === 0); });
    toggleCalendarFields(false);

    if (fields.targetDate) {
      var today = new Date();
      var yyyy = today.getFullYear();
      var mm = String(today.getMonth() + 1).padStart(2, '0');
      var dd = String(today.getDate()).padStart(2, '0');
      fields.targetDate.value = yyyy + '-' + mm + '-' + dd;
    }
    show();
  }

  function openEdit(event) {
    ensureElements();
    currentEditEvent = event;
    if (fields._title) fields._title.textContent = '编辑事件';
    if (!form) return;

    if (fields.title) fields.title.value = event.title || event.name || '';
    if (fields.targetDate) fields.targetDate.value = event.date || '';
    if (fields.targetTime) fields.targetTime.value = event.time || '00:00';
    if (fields.note) fields.note.value = event.note || '';

    var isLunar = event.calendar === 'lunar';
    var solarBtns = document.querySelectorAll('.seg-option');
    solarBtns.forEach(function (b) { b.classList.remove('active'); });
    if (isLunar && solarBtns[1]) solarBtns[1].classList.add('active');
    else if (solarBtns[0]) solarBtns[0].classList.add('active');
    toggleCalendarFields(isLunar);

    if (fields.lunarYear) fields.lunarYear.value = event.lunarYear || '';
    if (fields.lunarMonth) fields.lunarMonth.value = event.lunarMonth || '';
    if (fields.lunarDay) fields.lunarDay.value = event.lunarDay || '';
    if (fields.isLeapMonth) fields.isLeapMonth.value = String(event.isLeapMonth || false);

    // 事件类型
    if (fields.type) {
      var typeVal = event.type || 'countdown';
      var typeOpts = fields.type.options;
      for (var i = 0; i < typeOpts.length; i++) {
        if (typeOpts[i].value === typeVal) { fields.type.selectedIndex = i; break; }
      }
    }
    show();
  }

  function onSubmit(cb) { submitCallback = cb; }

  function handleSubmit(e) {
    e.preventDefault();
    ensureElements();

    var solarBtns = document.querySelectorAll('.seg-option');
    var activeSeg = document.querySelector('.seg-option.active');
    var isLunar = activeSeg ? activeSeg.getAttribute('data-value') === 'lunar' : false;

    var eventData = {
      title: fields.title ? fields.title.value.trim() : '',
      type: fields.type ? fields.type.value : 'countdown',
      calendar: isLunar ? 'lunar' : 'solar',
      date: fields.targetDate ? fields.targetDate.value : '',
      time: fields.targetTime ? fields.targetTime.value : '00:00',
      note: fields.note ? fields.note.value.trim() : ''
    };

    if (isLunar) {
      eventData.lunarMonth = fields.lunarMonth ? parseInt(fields.lunarMonth.value, 10) : null;
      eventData.lunarDay = fields.lunarDay ? parseInt(fields.lunarDay.value, 10) : null;
      eventData.lunarYear = fields.lunarYear ? parseInt(fields.lunarYear.value, 10) : null;
      var isLeapStr = fields.isLeapMonth ? fields.isLeapMonth.value : 'false';
      eventData.isLeapMonth = isLeapStr === 'true';
      if (!eventData.lunarMonth || !eventData.lunarDay) {
        notify('请填写农历月份和日期');
        return;
      }
    } else {
      if (!eventData.date) {
        notify('请选择目标日期');
        return;
      }
    }

    if (!eventData.title) {
      notify('请填写事件名称');
      return;
    }

    if (submitCallback) {
      submitCallback(eventData, currentEditEvent);
    }
  }

  window.Modal = {
    openCreate: openCreate,
    openEdit: openEdit,
    close: close,
    onSubmit: onSubmit
  };
})(window);