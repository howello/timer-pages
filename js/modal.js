/**
 * 新增/编辑弹窗模块
 * 表单支持 4 类事件 + 公历/农历动态字段
 */
(function (window) {
  'use strict';

  var backdrop = null;
  var modal = null;
  var title = null;
  var form = null;
  var currentEditEvent = null; // 编辑中的事件对象

  var submitCallback = null; // onSubmit(cb) 注册的回调

  // 字段元素缓存
  var fields = {};

  function ensureElements() {
    if (backdrop) return;
    backdrop = document.getElementById('modal-backdrop');
    modal = document.querySelector('.add-event-modal');
    title = document.getElementById('modal-title');
    form = document.getElementById('event-form');

    if (backdrop) {
      var inputs = backdrop.querySelectorAll('input, select, textarea');
      inputs.forEach(function (el) {
        if (el.name) fields[el.name] = el;
      });

      // 日期体系切换（checkbox -> solar/lunar）
      if (fields.isLunar) {
        fields.isLunar.addEventListener('change', toggleCalendar);
      }
      // 提交
      if (form) {
        form.addEventListener('submit', handleSubmit);
      }
      // 取消
      var cancelBtn = document.getElementById('cancel-btn');
      if (cancelBtn) cancelBtn.addEventListener('click', close);
      // 关闭按钮
      var closeBtn = document.getElementById('close-modal-btn');
      if (closeBtn) closeBtn.addEventListener('click', close);
      // 点击遮罩关闭
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) close();
      });
    }
  }

  function toggleCalendar() {
    var isLunar = !!fields.isLunar && fields.isLunar.checked;
    var solarFields = ['targetDate', 'targetTime'];
    var lunarFields = ['lunarYear', 'lunarMonth', 'lunarDay', 'isLeapMonth'];

    solarFields.forEach(function (name) {
      if (fields[name]) fields[name].style.display = isLunar ? 'none' : '';
    });
    lunarFields.forEach(function (name) {
      if (fields[name]) fields[name].style.display = isLunar ? '' : 'none';
    });
  }

  function show() {
    ensureElements();
    if (!backdrop) {
      console.warn('Modal: backdrop not found in DOM');
      return;
    }
    backdrop.style.display = 'flex';
  }

  function close() {
    ensureElements();
    if (!backdrop) return;
    backdrop.style.display = 'none';
    currentEditEvent = null;
    if (form) form.reset();
    if (fields.isLunar) {
      fields.isLunar.checked = false;
      toggleCalendar();
    }
  }

  function openCreate() {
    ensureElements();
    currentEditEvent = null;
    if (title) title.textContent = '新增事件';
    if (form) form.reset();
    if (fields.isLunar) {
      fields.isLunar.checked = false;
      toggleCalendar();
    }
    // 默认日期：今天
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
    if (title) title.textContent = '编辑事件';
    if (!form) return;

    // 回填字段
    if (fields.title) fields.title.value = event.title || '';
    if (fields.targetDate) fields.targetDate.value = event.date || '';
    if (fields.targetTime) fields.targetTime.value = event.time || '00:00';
    if (fields.note) fields.note.value = event.note || '';
    // isLunar
    var isLunar = event.calendar === 'lunar';
    if (fields.isLunar) {
      fields.isLunar.checked = isLunar;
      toggleCalendar();
    }
    if (fields.lunarYear) fields.lunarYear.value = event.lunarYear || '';
    if (fields.lunarMonth) fields.lunarMonth.value = event.lunarMonth || '';
    if (fields.lunarDay) fields.lunarDay.value = event.lunarDay || '';
    if (fields.isLeapMonth) fields.isLeapMonth.value = String(event.isLeapMonth || false);
    if (fields.cardColor) {
      var color = event.cardColor || 'mint';
      var opts = fields.cardColor.options;
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].value === color) { fields.cardColor.selectedIndex = i; break; }
      }
    }
    show();
  }

  function onSubmit(cb) {
    submitCallback = cb;
  }

  function handleSubmit(e) {
    e.preventDefault();
    ensureElements();

    var isLunar = !!fields.isLunar && fields.isLunar.checked;
    var isLeap = !!fields.isLeapMonth && fields.isLeapMonth.value === 'true';

    var eventData = {
      title: fields.title ? fields.title.value.trim() : '',
      type: 'countdown',
      calendar: isLunar ? 'lunar' : 'solar',
      date: fields.targetDate ? fields.targetDate.value : '',
      time: fields.targetTime ? fields.targetTime.value : '00:00',
      note: fields.note ? fields.note.value.trim() : '',
      cardColor: fields.cardColor ? fields.cardColor.value : 'mint'
    };

    if (isLunar) {
      eventData.lunarMonth = fields.lunarMonth ? parseInt(fields.lunarMonth.value, 10) : null;
      eventData.lunarDay = fields.lunarDay ? parseInt(fields.lunarDay.value, 10) : null;
      eventData.lunarYear = fields.lunarYear ? parseInt(fields.lunarYear.value, 10) : null;
      eventData.isLeapMonth = isLeap;
      // 农历事件：date 为空，使用 lunar 字段
      if (!eventData.lunarMonth || !eventData.lunarDay) {
        alert('请完整填写农历月份和日期');
        return;
      }
    } else {
      if (!eventData.date) {
        alert('请选择目标日期');
        return;
      }
    }

    if (!eventData.title) {
      alert('请填写事件名称');
      return;
    }

    if (submitCallback) {
      submitCallback(eventData, currentEditEvent);
    } else {
      console.warn('Modal: no submit callback registered');
    }
  }

  // 导出
  window.Modal = {
    openCreate: openCreate,
    openEdit: openEdit,
    close: close,
    onSubmit: onSubmit
  };
})(window);
