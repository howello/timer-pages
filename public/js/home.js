/**
 * 主页装配模块
 * 负责初始化、滚动动画（window.scrollY）、置顶、拖拽、新增/编辑/删除
 */
(function (window) {
  'use strict';

  var cards = [];
  var draggedId = null;
  var reduceMotion = false;

  function init() {
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function startApp() {
      bindScrollReveal();
      bindHeaderActions();
      bindModalSubmit();
      updateCurrentTime();
      setInterval(updateCurrentTime, 1000);

      if (window.loadAppConfig) {
        window.loadAppConfig().then(loadAndRender);
      } else {
        loadAndRender();
      }
    }

    if (window.AccessGate && window.AccessGate.requireAuth) {
      window.AccessGate.requireAuth().then(function (valid) {
        if (valid) startApp();
      });
    } else {
      startApp();
    }
  }

  async function loadAndRender() {
    try {
      await window.EventStore.load();
      cards = window.EventStore.getSortedCards();
      renderAll();
    } catch (error) {
      console.warn('主页数据加载失败，使用空数据降级:', error);
      cards = [];
      renderAll();
      showToast('数据加载失败，已使用空列表降级');
    }
  }

  function renderAll() {
    window.CardRender.renderFixed(cards);
    window.CardRender.renderList(cards, {
      onPin: handlePin,
      onEdit: handleEdit,
      onDelete: handleDelete
    });
    bindDragAndDrop();
    window.CardRender.startLiveTimer(function () { return cards; });
  }

  function bindScrollReveal() {
    var header = document.getElementById('floating-header');
    var revealed = document.getElementById('revealed-list');

    if (reduceMotion) {
      if (header) header.classList.add('is-visible');
      if (revealed) revealed.classList.add('is-visible');
      return;
    }

    function update() {
      var show = window.scrollY > 80;
      if (header) header.classList.toggle('is-visible', show);
      if (revealed) revealed.classList.toggle('is-visible', show);
    }

    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  function bindHeaderActions() {
    var addBtn = document.getElementById('add-event-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        window.Modal.openCreate();
      });
    }

    var syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', function () {
        loadAndRender();
        showToast('已重新同步');
      });
    }

    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        if (window.AccessGate && window.AccessGate.logout) {
          window.AccessGate.logout().finally(function () {
            window.location.href = '/password.html';
          });
        } else {
          window.location.href = '/password.html';
        }
      });
    }
  }

  function bindModalSubmit() {
    window.Modal.onSubmit(async function (eventData, editingEvent) {
      try {
        if (editingEvent && editingEvent.id) {
          eventData.id = editingEvent.id;
          eventData.pinned = editingEvent.pinned;
          eventData.order = editingEvent.order;
          await window.EventStore.update(eventData);
          showToast('事件已更新');
        } else {
          await window.EventStore.add(eventData);
          showToast('事件已新增');
        }
        window.Modal.close();
        cards = window.EventStore.getSortedCards();
        renderAll();
      } catch (error) {
        console.error('保存事件失败:', error);
        alert('保存失败：' + error.message);
      }
    });
  }

  async function handlePin(id) {
    try {
      await window.EventStore.togglePin(id);
      cards = window.EventStore.getSortedCards();
      renderAll();
    } catch (error) {
      console.error('置顶失败:', error);
      alert('置顶失败：' + error.message);
    }
  }

  function handleEdit(card) {
    if (card.id && card.id.startsWith('festival:')) {
      showToast('节假日数据来自 API，不能编辑');
      return;
    }
    window.Modal.openEdit(card);
  }

  async function handleDelete(id) {
    if (id && id.startsWith('festival:')) {
      showToast('节假日数据来自 API，不能删除');
      return;
    }
    if (!confirm('确认删除这个事件吗？')) return;
    try {
      await window.EventStore.remove(id);
      cards = window.EventStore.getSortedCards();
      renderAll();
      showToast('事件已删除');
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败：' + error.message);
    }
  }

  function bindDragAndDrop() {
    var list = document.getElementById('event-list');
    if (!list) return;

    list.querySelectorAll('.list-card').forEach(function (cardEl) {
      cardEl.addEventListener('dragstart', function (e) {
        draggedId = cardEl.getAttribute('data-id');
        cardEl.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedId);
      });

      cardEl.addEventListener('dragend', function () {
        cardEl.classList.remove('is-dragging');
        draggedId = null;
      });

      cardEl.addEventListener('dragover', function (e) {
        e.preventDefault();
        var dragging = list.querySelector('.is-dragging');
        if (!dragging || dragging === cardEl) return;
        var rect = cardEl.getBoundingClientRect();
        var before = e.clientY < rect.top + rect.height / 2;
        if (before) {
          list.insertBefore(dragging, cardEl);
        } else {
          list.insertBefore(dragging, cardEl.nextSibling);
        }
      });
    });

    list.addEventListener('drop', async function (e) {
      e.preventDefault();
      var ids = Array.from(list.querySelectorAll('.list-card')).map(function (el) {
        return el.getAttribute('data-id');
      });
      try {
        await window.EventStore.reorder(ids);
        cards = window.EventStore.getSortedCards();
        renderAll();
        showToast('排序已保存');
      } catch (error) {
        console.error('排序失败:', error);
        alert('排序失败：' + error.message);
      }
    });

    // 触屏拖拽兼容层
    list.querySelectorAll('.list-card').forEach(function (cardEl) {
      cardEl.addEventListener('touchstart', function (e) {
        cardEl.setAttribute('data-touch-y', e.touches[0].clientY);
      }, { passive: true });

      cardEl.addEventListener('touchmove', function (e) {
        var target = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
        var overCard = target ? target.closest('.list-card') : null;
        if (overCard && overCard !== cardEl) {
          e.preventDefault();
          var rect = overCard.getBoundingClientRect();
          var before = e.touches[0].clientY < rect.top + rect.height / 2;
          if (before) {
            list.insertBefore(cardEl, overCard);
          } else {
            list.insertBefore(cardEl, overCard.nextSibling);
          }
        }
      }, { passive: false });
    });
  }

  function updateCurrentTime() {
    var el = document.getElementById('current-time');
    if (!el) return;
    var now = new Date();
    el.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  }

  function showToast(message) {
    var toast = document.createElement('div');
    toast.className = 'soft-status app-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () { toast.classList.add('is-visible'); }, 10);
    setTimeout(function () {
      toast.classList.remove('is-visible');
      setTimeout(function () { toast.remove(); }, 300);
    }, 1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);