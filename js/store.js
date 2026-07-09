/**
 * 事件数据中心
 * 负责合并自定义事件和节假日数据，提供统一的数据访问和管理接口
 */

(function(window) {
  'use strict';

  // 内部状态
  let allCards = []; // 合并后的所有卡片
  let customEvents = []; // 自定义事件（来自 OSS）
  let holidayMeta = {}; // 节假日元数据（pinned/order）
  let isLoaded = false; // 是否已加载

  /**
   * 加载数据：合并自定义事件 + 节假日
   * @returns {Promise<void>}
   */
  async function load() {
    try {
      // 1. 从 OSS 读取自定义事件和节假日元数据
      const config = await window.OSSStorage.read();
      customEvents = config.events || [];
      holidayMeta = config.holidayMeta || {};

      // 2. 获取当前年份的节假日
      const currentYear = new Date().getFullYear();
      const rawHolidays = await fetchHolidays(currentYear);
      const groupedHolidays = groupByName(rawHolidays);

      // 3. 生成节假日卡片
      const holidayCards = [];
      for (const [name, date] of groupedHolidays) {
        const id = `festival:${name}`;
        const meta = holidayMeta[id] || {};

        holidayCards.push({
          id: id,
          name: name,
          date: date,
          type: 'festival',
          highwayFree: isHighwayFree(name),
          pinned: meta.pinned || false,
          order: meta.order !== undefined ? meta.order : 9999
        });
      }

      // 4. 合并所有卡片
      allCards = [...customEvents, ...holidayCards];

      isLoaded = true;
      console.log(`数据加载完成: ${customEvents.length} 个自定义事件, ${holidayCards.length} 个节假日`);
    } catch (error) {
      console.error('数据加载失败:', error);
      // 失败时保持空数据
      allCards = [];
      customEvents = [];
      holidayMeta = {};
      throw error;
    }
  }

  /**
   * 获取排序后的卡片列表
   * 排序规则：pinned 降序、order 升序
   * @returns {Array} 排序后的卡片数组
   */
  function getSortedCards() {
    if (!isLoaded) {
      console.warn('数据尚未加载，返回空数组');
      return [];
    }

    // 统一排序：pinned 降序（置顶优先）、order 升序（序号小的在前）
    return [...allCards].sort((a, b) => {
      const pinnedDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      if (pinnedDiff !== 0) return pinnedDiff;

      const orderA = a.order !== undefined ? a.order : 9999;
      const orderB = b.order !== undefined ? b.order : 9999;
      return orderA - orderB;
    });
  }

  /**
   * 添加自定义事件
   * @param {Object} event - 事件对象
   * @returns {Promise<void>}
   */
  async function add(event) {
    if (!isLoaded) {
      throw new Error('数据尚未加载，无法添加事件');
    }

    // 生成唯一 ID
    event.id = event.id || `event_${Date.now()}`;
    event.pinned = event.pinned || false;
    event.order = event.order !== undefined ? event.order : customEvents.length;

    // 添加到自定义事件列表
    customEvents.push(event);

    // 重新合并数据
    await reloadCards();

    // 写回 OSS
    await persistToOSS();

    console.log(`事件添加成功: ${event.name}`);
  }

  /**
   * 更新自定义事件
   * @param {Object} event - 更新后的事件对象（必须包含 id）
   * @returns {Promise<void>}
   */
  async function update(event) {
    if (!isLoaded) {
      throw new Error('数据尚未加载，无法更新事件');
    }

    if (!event.id) {
      throw new Error('事件对象缺少 id 字段');
    }

    // 查找并更新
    const index = customEvents.findIndex(e => e.id === event.id);
    if (index === -1) {
      throw new Error(`未找到 ID 为 ${event.id} 的事件`);
    }

    customEvents[index] = event;

    // 重新合并数据
    await reloadCards();

    // 写回 OSS
    await persistToOSS();

    console.log(`事件更新成功: ${event.name}`);
  }

  /**
   * 删除自定义事件
   * @param {string} id - 事件 ID
   * @returns {Promise<void>}
   */
  async function remove(id) {
    if (!isLoaded) {
      throw new Error('数据尚未加载，无法删除事件');
    }

    // 只能删除自定义事件
    if (id.startsWith('festival:')) {
      throw new Error('不能删除节假日，只能调整其置顶/排序');
    }

    const index = customEvents.findIndex(e => e.id === id);
    if (index === -1) {
      throw new Error(`未找到 ID 为 ${id} 的事件`);
    }

    const eventName = customEvents[index].name;
    customEvents.splice(index, 1);

    // 重新合并数据
    await reloadCards();

    // 写回 OSS
    await persistToOSS();

    console.log(`事件删除成功: ${eventName}`);
  }

  /**
   * 切换事件的置顶状态
   * @param {string} id - 事件 ID
   * @returns {Promise<void>}
   */
  async function togglePin(id) {
    if (!isLoaded) {
      throw new Error('数据尚未加载，无法切换置顶');
    }

    // 判断是自定义事件还是节假日
    if (id.startsWith('festival:')) {
      // 节假日：更新 holidayMeta
      if (!holidayMeta[id]) {
        holidayMeta[id] = { pinned: false, order: 9999 };
      }
      holidayMeta[id].pinned = !holidayMeta[id].pinned;
    } else {
      // 自定义事件：更新 customEvents
      const event = customEvents.find(e => e.id === id);
      if (!event) {
        throw new Error(`未找到 ID 为 ${id} 的事件`);
      }
      event.pinned = !event.pinned;
    }

    // 重新合并数据
    await reloadCards();

    // 写回 OSS
    await persistToOSS();

    console.log(`事件置顶状态切换成功: ${id}`);
  }

  /**
   * 批量重排序
   * @param {Array<string>} ids - 按目标顺序排列的 ID 数组
   * @returns {Promise<void>}
   */
  async function reorder(ids) {
    if (!isLoaded) {
      throw new Error('数据尚未加载，无法重排序');
    }

    // 按 ID 顺序分配 order 值
    ids.forEach((id, index) => {
      if (id.startsWith('festival:')) {
        // 节假日：更新 holidayMeta
        if (!holidayMeta[id]) {
          holidayMeta[id] = { pinned: false, order: index };
        } else {
          holidayMeta[id].order = index;
        }
      } else {
        // 自定义事件：更新 customEvents
        const event = customEvents.find(e => e.id === id);
        if (event) {
          event.order = index;
        }
      }
    });

    // 重新合并数据
    await reloadCards();

    // 写回 OSS
    await persistToOSS();

    console.log(`批量重排序成功: ${ids.length} 个事件`);
  }

  /**
   * 重新加载卡片列表（内部辅助函数）
   * @returns {Promise<void>}
   */
  async function reloadCards() {
    // 重新获取节假日数据
    const currentYear = new Date().getFullYear();
    const rawHolidays = await fetchHolidays(currentYear);
    const groupedHolidays = groupByName(rawHolidays);

    // 重新生成节假日卡片
    const holidayCards = [];
    for (const [name, date] of groupedHolidays) {
      const id = `festival:${name}`;
      const meta = holidayMeta[id] || {};

      holidayCards.push({
        id: id,
        name: name,
        date: date,
        type: 'festival',
        highwayFree: isHighwayFree(name),
        pinned: meta.pinned || false,
        order: meta.order !== undefined ? meta.order : 9999
      });
    }

    // 合并所有卡片
    allCards = [...customEvents, ...holidayCards];
  }

  /**
   * 持久化到 OSS（内部辅助函数）
   * @returns {Promise<void>}
   */
  async function persistToOSS() {
    const config = {
      version: 1,
      events: customEvents,
      holidayMeta: holidayMeta
    };

    await window.OSSStorage.write(config);
  }

  // 导出 API
  window.EventStore = {
    load: load,
    getSortedCards: getSortedCards,
    add: add,
    update: update,
    remove: remove,
    togglePin: togglePin,
    reorder: reorder
  };

})(window);
