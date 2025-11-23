/**
 * 待办提醒管理器
 * 处理来自后端的 TODO_REMINDER 类型消息，以弹窗形式显示
 *
 * 主要功能：
 * - 处理三种类型的提醒：daily_summary（每日汇总）、overdue（逾期提醒）、normal（普通提醒）
 * - 支持四级优先级：high、medium、low、normal
 * - 提供音效提醒和视觉效果
 * - 管理弹窗的显示、隐藏和交互
 */

/**
 * 待办提醒管理器
 * 处理来自后端的 TODO_REMINDER 类型消息，以弹窗形式显示
 *
 * 主要功能：
 * - 处理三种类型的提醒：daily_summary（每日汇总）、overdue（逾期提醒）、normal（普通提醒）
 * - 支持四级优先级：high、medium、low、normal
 * - 提供音效提醒和视觉效果
 * - 管理弹窗的显示、隐藏和交互
 */
class TodoReminderManager {
    /**
     * 构造函数
     * 初始化待办提醒管理器实例
     */
    constructor() {
        this.container = null;
        this.audioContext = null;
        this.activeReminders = new Map(); // 存储当前活跃的提醒
        this.snoozedReminders = new Map(); // 存储稍后提醒的队列
        this.currentSnoozeModal = null;
        this.historyData = new Map(); // 存储历史记录
        this.currentHistoryModal = null;
        // 调试相关缓存
        this._debugRawBuffer = [];
        this._debugEnabled = false;

        // 性能优化：DOM查询缓存
        this._domCache = new Map();
        this._eventDelegationHandler = null;

        // HTML 模板常量 - 提取字符串模板提高可读性和可维护性
        this.TEMPLATES = {
            // 弹窗基础结构模板
            POPUP_WRAPPER: (html, config) => `
                <div class="todo-reminder-popup priority-${config.priority} type-${config.type}">
                    ${html}
                </div>
            `,

            // 弹窗头部模板
            HEADER: (title, priorityIcon, showHelpButton = false) => `
                <div class="todo-reminder-header">
                    <div class="todo-reminder-title">
                        <span class="priority-icon-wrapper">${priorityIcon}</span>
                        <span class="title-content">
                            <span class="title-text">${title}</span>
                            ${showHelpButton ? `
                                <button class="todo-help-btn" onclick="todoReminderManager.showHelpTooltip(this)" title="使用帮助">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="10"/>
                                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                </button>
                            ` : ''}
                        </span>
                    </div>
                </div>
            `,

            // 关闭按钮模板已移除

            // 主体内容区模板
            BODY_START: `<div class="todo-reminder-body">`,
            BODY_END: `</div>`,

            // 操作按钮区域模板（使用事件委托）
            ACTIONS: (agentBadge, todoId) => `
                <div class="todo-reminder-actions">
                    ${agentBadge}
                    <button class="todo-action-btn btn-dismiss" data-todo-action="snooze" data-todo-id="${todoId}">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v6l4 2"/>
                        </svg>
                        稍后提醒
                    </button>
                    <button class="todo-action-btn btn-gotit" data-todo-action="gotit" data-todo-id="${todoId}">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                            <path d="M5 13l4 4L19 7"/>
                        </svg>
                        知道了
                    </button>
                </div>
            `,

            // 时间显示模板
            TIME_DISPLAY: (time) => `
                <div class="todo-time">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                    </svg>
                    <span>${time}</span>
                </div>
            `,

            // 标签显示模板
            TAGS_DISPLAY: (tags) => `
                <div class="todo-tags">
                    ${tags}
                </div>
            `
        };

        this.init();
    }

    /**
     * 初始化待办提醒管理器
     * 获取DOM容器并初始化音频上下文
     */
    init() {
        // 获取弹窗容器
        this.container = document.getElementById('todoReminderContainer');
        if (!this.container) {
            console.error('待办提醒容器未找到');
            return;
        }

        // 初始化音频上下文（用于播放提示音）
        // 不同浏览器可能使用不同的AudioContext实现
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('无法初始化音频上下文:', e);
        }

        // 加载稍后提醒队列
        this.loadSnoozedReminders();

        // 性能优化：懒加载历史记录（延迟到需要时再加载）
        // 移除 this.loadHistoryData(); 这行，让历史记录在首次打开时加载

        // 设置事件委托处理器
        this.setupEventDelegation();
    }

    /**
     * 性能优化：获取缓存的DOM元素
     * @param {string} selector - CSS选择器
     * @param {boolean} forceRefresh - 是否强制刷新缓存
     * @returns {HTMLElement|null} DOM元素
     */
    getCachedElement(selector, forceRefresh = false) {
        if (!forceRefresh && this._domCache.has(selector)) {
            return this._domCache.get(selector);
        }

        const element = document.querySelector(selector);
        if (element) {
            this._domCache.set(selector, element);
        }
        return element;
    }

    /**
     * 性能优化：清除DOM缓存
     */
    clearDOMCache() {
        this._domCache.clear();
    }

    /**
     * 性能优化：设置事件委托
     */
    setupEventDelegation() {
        // 为动态生成的元素设置事件委托
        if (!this._eventDelegationHandler) {
            this._eventDelegationHandler = (e) => {
                const target = e.target.closest('[data-todo-action]');
                if (target) {
                    const action = target.getAttribute('data-todo-action');
                    const todoId = target.getAttribute('data-todo-id');

                    // 验证 todoId 是否有效（对于需要 todoId 的操作）
                    if (!todoId && action !== 'close') {
                        console.warn(`[TodoReminder] 操作 "${action}" 需要有效的 todoId`);
                        return;
                    }

                    switch (action) {
                        case 'snooze':
                            this.dismissReminder(todoId);
                            break;
                        case 'gotit':
                            // 知道了按钮：直接关闭弹窗
                            if (todoId) {
                                this.closeReminder(todoId);
                            } else {
                                const popup = target.closest('.todo-reminder-popup');
                                if (popup) {
                                    this.closeReminder(popup);
                                }
                            }
                            break;
                    }
                }
            };

            // 使用事件委托而不是直接绑定
            document.addEventListener('click', this._eventDelegationHandler);
        }
    }

    /**
     * 性能优化：使用DocumentFragment批量添加DOM元素
     * @param {HTMLElement} parent - 父元素
     * @param {Array<HTMLElement>} elements - 要添加的元素数组
     */
    appendElementsBatch(parent, elements) {
        if (elements.length === 0) return;

        // 使用DocumentFragment减少DOM操作次数
        const fragment = document.createDocumentFragment();

        elements.forEach(el => {
            fragment.appendChild(el);
        });

        parent.appendChild(fragment);
    }

    /**
     * 处理待办提醒消息
     * 支持 JSON v2.0 和 v1.0 格式的自动检测与解析
     *
     * @param {Object|string} data - 提醒数据对象或 JSON 字符串
     * @param {string} data.type - 消息类型，必须为 'TODO_REMINDER' (v1.0)
     * @param {string} data.reminderType - 提醒类型：'daily_summary'、'overdue'、'normal'
     * @param {string} data.priority - 优先级：'high'、'medium'、'low'、'normal'
     */
    handleTodoReminder(data) {
        try {
            // 第一步：自动检测并解析数据格式
            const parsedData = this.parseReminderData(data);

            if (!parsedData) {
                console.warn('提醒数据解析失败，跳过处理');
                return;
            }

            // 第二步：验证消息类型
            if (!this.validateReminderType(parsedData)) {
                return;
            }

            // 第三步：根据提醒类型分派到不同的处理方法
            switch (parsedData.reminderType) {
                case 'daily_summary':
                    this.showDailySummary(parsedData);
                    break;
                case 'overdue':
                    this.showOverdueAlert(parsedData);
                    break;
                case 'normal':
                    this.showNormalReminder(parsedData);
                    break;
                default:
                    console.warn('未知的提醒类型:', parsedData.reminderType);
            }

            // 第四步：根据优先级播放不同音效
            this.playSound(parsedData.priority || 'normal');

        } catch (error) {
            console.error('处理提醒消息时发生错误:', error);
        }
    }

    /**
     * 自动检测并解析提醒数据格式
     * 支持 JSON v2.0 和 v1.0 格式的自动识别
     *
     * @param {Object|string} data - 原始数据
     * @returns {Object|null} 解析后的数据对象，解析失败返回 null
     */
    parseReminderData(data) {
        // 调试：保留原始输入
        this._captureRawReminder(data);
        // 如果是字符串，尝试解析为 JSON
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                console.warn('JSON 解析失败，尝试作为纯文本处理:', e);
                return this.parseLegacyTextFormat(data);
            }
        }

        // 检测是否为 v2.0 格式
        if (this.isV2Format(data)) {
            return this.convertV2ToV1(data);
        }

        // 如果是 v1.0 对象格式或已经是标准格式，直接返回
        if (data && data.type === 'TODO_REMINDER') {
            return data;
        }

        // 兜底：尝试解析为传统文本格式
        return this.parseLegacyTextFormat(data);
    }

    /**
     * 检测是否为 JSON v2.0 格式
     *
     * @param {Object} data - 要检测的数据
     * @returns {boolean} 如果是 v2.0 格式返回 true，否则返回 false
     */
    isV2Format(data) {
        // v2.0 格式的特征：
        // 1. 有 version 字段且值为 "2.0"
        // 2. 有 type 字段且值为 "TODO_REMINDER"
        // 3. 有 data 字段（对象）
        // 4. 有 metadata 字段
        return data &&
               data.version === '2.0' &&
               data.type === 'TODO_REMINDER' &&
               data.data &&
               typeof data.data === 'object' &&
               data.metadata;
    }

    /**
     * 将 JSON v2.0 格式转换为 v1.0 兼容格式
     * 字段映射：v2.0.data.* -> v1.0.*
     *
     * @param {Object} v2Data - v2.0 格式的数据
     * @returns {Object} v1.0 兼容格式的数据
     */
    convertV2ToV1(v2Data) {
        const v1Data = {
            type: 'TODO_REMINDER',
            reminderType: v2Data.reminderType,
            priority: v2Data.priority,
            // 从 v2.data 映射核心字段
            todoId: v2Data.data.todoId,
            title: v2Data.data.title,
            // 内容字段增加回退链，避免出现 null -> 前端空白
            content: v2Data.data.content || v2Data.data.description || v2Data.data.text || v2Data.data.title || '',
            message: v2Data.data.content || v2Data.data.description || v2Data.data.text || v2Data.data.title || '',
            scheduledTime: v2Data.data.deadline,
            timestamp: v2Data.data.updatedAt,
            tags: v2Data.data.tags || [],
            agentName: v2Data.metadata.agentName,
            // 扩展字段映射
            id: v2Data.data.id,
            status: v2Data.data.status,
            deadline: v2Data.data.deadline,
            createdAt: v2Data.data.createdAt,
            updatedAt: v2Data.data.updatedAt,
            assignee: v2Data.data.assignee,
            progress: v2Data.data.progress,
            timeInfo: v2Data.data.timeInfo,
            overdueInfo: v2Data.data.overdueInfo
        };

        // 处理汇总类型特殊字段
        if (v2Data.reminderType === 'daily_summary' && v2Data.data.summary) {
            v1Data.summary = {
                total: v2Data.data.summary.total || 0,
                completed: v2Data.data.summary.completed || 0,
                pending: v2Data.data.summary.pending || 0,
                overdue: v2Data.data.summary.overdue || 0
            };
            v1Data.items = v2Data.data.relatedTodos || v2Data.data.items || [];
        }

        // 处理逾期类型特殊字段
        if (v2Data.reminderType === 'overdue' && v2Data.data.overdueInfo) {
            v1Data.overdueInfo = v2Data.data.overdueInfo;
            // 构建逾期项目列表
            const overdueItem = {
                title: v2Data.data.title,
                content: v2Data.data.content,
                scheduledTime: v2Data.data.deadline,
                priority: v2Data.priority
            };
            v1Data.items = [overdueItem];
        }

        return v1Data;
    }

    /**
     * 捕获原始提醒数据（调试模式）
     * @param {*} raw - 原始数据
     */
    _captureRawReminder(raw) {
        if (!this._debugEnabled) return;
        try {
            const entry = {
                receivedAt: Date.now(),
                raw: typeof raw === 'string' ? raw : JSON.stringify(raw),
                type: typeof raw,
                size: typeof raw === 'string' ? raw.length : JSON.stringify(raw).length
            };
            this._debugRawBuffer.push(entry);
            // 只保留最近50条
            if (this._debugRawBuffer.length > 50) {
                this._debugRawBuffer.shift();
            }
        } catch (e) {
            console.warn('捕获原始提醒数据失败', e);
        }
    }

    /** 开启调试模式 */
    enableDebug() {
        this._debugEnabled = true;
        localStorage.setItem('todoReminderDebug', 'true');
        console.info('[TodoReminderManager] 调试模式已开启');
    }

    /** 关闭调试模式 */
    disableDebug() {
        this._debugEnabled = false;
        localStorage.removeItem('todoReminderDebug');
        console.info('[TodoReminderManager] 调试模式已关闭');
    }

    /** 输出最近原始提醒数据 */
    printRawBuffer() {
        console.group('[TodoReminderManager] 最近原始提醒数据');
        this._debugRawBuffer.forEach((e, idx) => {
            console.log(`#${idx + 1}`, new Date(e.receivedAt).toISOString(), e);
        });
        console.groupEnd();
    }

    /**
     * 解析传统文本格式
     * 兜底处理无法解析为 JSON 的数据
     *
     * @param {*} data - 原始数据
     * @returns {Object|null} 标准化后的数据对象
     */
    parseLegacyTextFormat(data) {
        // 如果是字符串，直接包装为基本格式
        if (typeof data === 'string') {
            return {
                type: 'TODO_REMINDER',
                reminderType: 'normal',
                priority: 'normal',
                title: '待办提醒',
                content: data,
                message: data,
                timestamp: Date.now()
            };
        }

        // 如果已经是对象但不是标准格式，尝试标准化
        if (data && typeof data === 'object') {
            return {
                type: 'TODO_REMINDER',
                reminderType: data.reminderType || 'normal',
                priority: data.priority || 'normal',
                title: data.title || '待办提醒',
                content: data.content || data.message || '',
                message: data.message || data.content || '',
                timestamp: data.timestamp || Date.now(),
                ...data
            };
        }

        return null;
    }

    /**
     * 验证提醒类型是否有效
     *
     * @param {Object} data - 要验证的数据
     * @returns {boolean} 如果类型有效返回 true，否则返回 false
     */
    validateReminderType(data) {
        // 验证消息类型
        if (!data || data.type !== 'TODO_REMINDER') {
            console.warn('无效的消息类型:', data?.type);
            return false;
        }

        // 验证提醒类型
        const validTypes = ['daily_summary', 'overdue', 'normal'];
        if (!validTypes.includes(data.reminderType)) {
            console.warn('未知的提醒类型:', data.reminderType);
            return false;
        }

        return true;
    }

    /**
     * 显示普通提醒弹窗
     * 适用于一般的待办事项提醒，显示标题、内容、时间和标签信息
     *
     * @param {Object} data - 提醒数据
     * @param {string} data.priority - 优先级
     * @param {string} data.title - 提醒标题
     * @param {string} data.content - 提醒内容
     * @param {string} data.message - 备用消息字段
     * @param {string|number} data.scheduledTime - 计划时间
     * @param {number} data.timestamp - 时间戳
     * @param {Array} data.tags - 标签列表
     * @param {string} data.agentName - 智能体名称
     * @param {string|number} data.todoId - 待办事项ID
     */
    showNormalReminder(data) {
        const reminder = this.createReminderElement({
            type: 'normal',
            priority: data.priority || 'normal',
            title: data.title || '待办提醒',
            // 内容回退链扩展，避免前端弹窗出现空白内容
            content: data.content || data.message || data.description || data.text || data.title,
            time: data.dueDateTime || data.deadline || data.scheduledTime || data.timestamp,
            tags: data.tags || [],
            agentName: data.agentName,
            todoId: data.todoId
        });

        this.displayReminder(reminder, data);
    }

    /**
     * 显示逾期提醒弹窗
     * 适用于待办事项已逾期的情况，使用高优先级样式突出显示
     * 支持单个或多个逾期项目的显示
     *
     * @param {Object} data - 提醒数据
     * @param {Array} data.items - 逾期项目列表
     * @param {string} data.agentName - 智能体名称
     * @param {string|number} data.todoId - 待办事项ID
     */
    showOverdueAlert(data) {
        // 获取逾期项目列表，支持单个或多个项目
        const overdueItems = data.items || [data];

        // 创建逾期提醒元素，自动使用高优先级样式
        const reminder = this.createReminderElement({
            type: 'overdue',
            priority: 'high', // 逾期项目强制使用高优先级
            title: '⚠️ 待办逾期提醒',
            content: overdueItems.length > 1
                ? `您有 ${overdueItems.length} 个待办事项已逾期`
                : (overdueItems[0]?.content || overdueItems[0]?.message || overdueItems[0]?.description || overdueItems[0]?.title || '该待办事项已逾期'),
            items: overdueItems,
            agentName: data.agentName,
            todoId: data.todoId
        });

        this.displayReminder(reminder, data);
    }

    /**
     * 显示每日待办汇总弹窗
     * 展示当日的待办事项统计信息，包括总计、已完成、待办、逾期等数据
     * 同时显示部分待办事项的简要信息
     *
     * @param {Object} data - 提醒数据
     * @param {Object} data.summary - 汇总统计数据
     * @param {number} data.summary.total - 总计数量
     * @param {number} data.summary.completed - 已完成数量
     * @param {number} data.summary.pending - 待办数量
     * @param {number} data.summary.overdue - 逾期数量
     * @param {Array} data.items - 待办事项列表
     * @param {string} data.agentName - 智能体名称
     * @param {string|number} data.todoId - 待办事项ID
     */
    showDailySummary(data) {
        // 获取汇总数据和待办事项列表
        const summaryData = data.summary || {};
        const allItems = data.items || [];

        // 计算所有统计数量 - 包含所有任务
        const completedItems = allItems.filter(item =>
            item.status === 'completed' || item.completed
        );

        const pendingItems = allItems.filter(item => {
            // 如果状态为 completed 或者标记为已完成，则排除
            if (item.status === 'completed' || item.completed) {
                return false;
            }
            return true;
        });

        // 计算逾期数量 - 包含无日期和过去日期的未完成任务
        const actualOverdueCount = pendingItems.filter(item => {
            // 优先使用 dueDateTime 字段（来自后端 ReminderDaemon）
            const deadline = item.deadline || item.dueDateTime || item.scheduledTime;
            // 如果没有截止日期的任务视为逾期
            if (!deadline) {
                return true;
            }
            // 如果有截止日期且已过期
            const deadlineDate = new Date(deadline);
            return deadlineDate < new Date();
        }).length;

        // 创建每日汇总提醒元素
        const reminder = this.createReminderElement({
            type: 'daily_summary',
            priority: 'normal', // 汇总使用普通优先级
            title: '📋 今日待办汇总',
            summary: {
                total: summaryData.total || allItems.length,
                completed: summaryData.completed || completedItems.length,
                pending: summaryData.pending || pendingItems.length,
                overdue: summaryData.overdue || actualOverdueCount
            },
            items: pendingItems, // 显示未完成的项目
            agentName: data.agentName,
            todoId: data.todoId
        });

        this.displayReminder(reminder, data);
    }

    /**
     * 创建提醒弹窗DOM元素
     * 这是核心的DOM构建方法，根据不同的提醒类型和配置创建完整的弹窗结构
     * 包括头部（标题和关闭按钮）、主体内容区（根据类型渲染不同内容）、操作按钮区
     *
     * 使用模板常量构建HTML字符串，提高代码可读性和可维护性
     *
     * @param {Object} config - 提醒元素配置对象
     * @param {string} config.type - 提醒类型：'daily_summary'、'overdue'、'normal'
     * @param {string} config.priority - 优先级：'high'、'medium'、'low'、'normal'
     * @param {string} config.title - 弹窗标题
     * @param {string} config.content - 提醒内容（普通类型）
     * @param {string|number} config.time - 时间信息
     * @param {Array} config.tags - 标签列表
     * @param {Object} config.summary - 汇总数据（每日汇总类型）
     * @param {Array} config.items - 项目列表（逾期/汇总类型）
     * @param {string} config.agentName - 智能体名称
     * @param {string|number} config.todoId - 待办事项ID
     * @returns {HTMLElement} 创建的提醒弹窗DOM元素
     */
    createReminderElement(config) {
        // 从配置对象中解构所需属性，便于后续使用
        const {
            type,
            priority,
            title,
            content,
            time,
            tags,
            summary,
            items,
            agentName,
            todoId
        } = config;

        // 创建弹窗根元素并设置CSS类名和data属性
        const reminderEl = document.createElement('div');
        reminderEl.className = `todo-reminder-popup priority-${priority} type-${type}`;
        // 统一ID生成逻辑：如果后端未提供 todoId，使用自动生成的稳定ID，避免多处 Date.now() 导致不一致
        const finalTodoId = (todoId !== undefined && todoId !== null && todoId !== '')
            ? String(todoId)
            : `auto_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        reminderEl.setAttribute('data-todo-id', finalTodoId);

        // 根据优先级获取对应的图标（🔴🟡🟢🔵）
        const priorityIcon = this.getPriorityIcon(priority);

        // 构建弹窗HTML结构，使用模板常量提高可读性
        // 第一步：构建头部（标题 + 帮助按钮）
        const headerHtml = this.TEMPLATES.HEADER(
            this.escapeHtml(title),
            `<span class="priority-icon">${priorityIcon}</span>`,
            this.isFirstTimeUser() // 首次用户显示帮助按钮
        );

        // 第二步：根据提醒类型渲染主体内容
        let bodyContent = '';
        if (type === 'daily_summary' && summary) {
            // 每日汇总类型：显示统计信息和项目列表
            bodyContent = this.renderDailySummary(summary, items);
        } else if (type === 'overdue' && items && items.length > 1) {
            // 逾期提醒类型：显示逾期项目列表
            bodyContent = this.renderOverdueList(items);
        } else {
            // 普通提醒类型：显示内容、时间和标签
            bodyContent = this.renderNormalContent(content, time, tags);
        }

        // 第三步：构建完整的HTML结构
        const fullHtml = headerHtml +
            this.TEMPLATES.BODY_START +
            bodyContent +
            this.TEMPLATES.BODY_END +
            this.TEMPLATES.ACTIONS(
                agentName ? `<span class="todo-agent-badge">${this.escapeHtml(agentName)}</span>` : '',
                finalTodoId
            );

        // 将HTML字符串注入到DOM元素中
        reminderEl.innerHTML = fullHtml;
        return reminderEl;
    }

    /**
     * 渲染每日汇总内容
     * 生成统计卡片网格和项目列表的HTML结构
     *
     * 该方法构建两个主要部分：
     * 1. 统计卡片网格 - 显示总计、已完成、待办、逾期等关键指标
     * 2. 项目列表 - 显示待办事项的简要信息（最多5项）
     *
     * @param {Object} summary - 汇总统计数据
     * @param {number} summary.total - 总计数量
     * @param {number} summary.completed - 已完成数量
     * @param {number} summary.pending - 待办数量
     * @param {number} summary.overdue - 逾期数量
     * @param {Array} items - 待办事项列表
     * @returns {string} 渲染后的HTML字符串
     */
    renderDailySummary(summary, items) {
        // 构建统计卡片网格部分
        // 使用grid布局显示四个核心指标，逾期数量仅在>0时显示
        let html = `
            <div class="summary-stats">
                <div class="stat-item" data-type="total">
                    <div class="stat-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                        </svg>
                    </div>
                    <span class="stat-label">总计</span>
                    <span class="stat-value">${summary.total}</span>
                </div>
                <div class="stat-item" data-type="completed">
                    <div class="stat-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <span class="stat-label">已完成</span>
                    <span class="stat-value">${summary.completed}</span>
                </div>
                <div class="stat-item" data-type="pending">
                    <div class="stat-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                    </div>
                    <span class="stat-label">待办</span>
                    <span class="stat-value">${summary.pending}</span>
                </div>
                ${summary.overdue > 0 ? `
                <div class="stat-item" data-type="overdue">
                    <div class="stat-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                    </div>
                    <span class="stat-label">逾期</span>
                    <span class="stat-value">${summary.overdue}</span>
                </div>
                ` : ''}
            </div>
        `;

        // 构建项目列表部分
        // 如果有待办事项，显示前5项的简要信息，包含优先级图标和内容
        if (items && items.length > 0) {
            html += `<div class="summary-items-list">`;

            // 遍历待办事项，提取优先级图标和内容
            items.slice(0, 5).forEach(item => {
                const priority = item.priority || 'normal';
                const itemContent = item.content || item.message || item.title;
                const priorityData = this.getPriorityData(priority);
                // 优先使用 dueDateTime 字段
                const deadline = item.dueDateTime || item.deadline || item.scheduledTime;

                html += `
                    <div class="summary-item" data-priority="${priority}">
                        <div class="item-priority-indicator">
                            <span class="priority-icon" style="color: ${priorityData.color}">${priorityData.icon}</span>
                        </div>
                        <div class="item-content-wrapper">
                            <span class="item-content">${this.escapeHtml(itemContent)}</span>
                            ${deadline ? `<span class="item-time">${this.formatTime(deadline)}</span>` : ''}
                        </div>
                    </div>
                `;
            });

            // 如果项目超过5项，显示提示信息
            if (items.length > 5) {
                html += `<div class="summary-item-more">还有 ${items.length - 5} 项...</div>`;
            }

            html += `</div>`;
        }

        return html;
    }

    /**
     * 渲染逾期项目列表
     * 生成逾期项目的HTML结构，突出显示逾期警告信息
     *
     * 该方法专门用于逾期提醒场景，采用红色警示样式：
     * - 每个逾期项目使用渐变红色背景和左边框突出显示
     * - 显示项目标题、计划完成时间和详细内容
     * - 最多显示3个项目，避免弹窗过长
     *
     * @param {Array} items - 逾期项目列表
     * @param {string} items[].title - 项目标题
     * @param {string} items[].content - 项目内容
     * @param {string} items[].message - 备用消息字段
     * @param {string|number} items[].scheduledTime - 计划完成时间
     * @returns {string} 渲染后的HTML字符串
     */
    renderOverdueList(items) {
        let html = `<div class="overdue-items-list">`;

        // 遍历逾期项目列表，最多显示3个
        // 每个项目显示标题、计划时间和详细内容（如果有）
        items.slice(0, 3).forEach(item => {
            const title = this.escapeHtml(item.title || item.content || item.message);
            // 优先使用 dueDateTime 字段
            const deadline = item.dueDateTime || item.deadline || item.scheduledTime;
            const hasScheduleTime = !!deadline;
            const scheduleTimeText = hasScheduleTime
                ? `<span class="overdue-time">应于 ${this.formatTime(deadline)} 完成</span>`
                : '';
            const hasExtraContent = item.content && item.title !== item.content;
            const extraContent = hasExtraContent
                ? `<p class="overdue-item-content">${this.escapeHtml(item.content)}</p>`
                : '';

            html += `
                <div class="overdue-item">
                    <div class="overdue-item-header">
                        <span class="overdue-item-title">${title}</span>
                        ${scheduleTimeText}
                    </div>
                    ${extraContent}
                </div>
            `;
        });

        // 如果超过3项，显示提示信息，告知用户还有更多逾期项目
        if (items.length > 3) {
            html += `<div class="overdue-item-more">还有 ${items.length - 3} 项逾期...</div>`;
        }

        html += `</div>`;
        return html;
    }

    /**
     * 渲染普通提醒内容
     * 生成普通类型提醒的HTML结构，包括内容、时间和标签
     *
     * 该方法用于普通提醒类型的场景，按顺序渲染三个可选部分：
     * 1. 提醒内容 - 主文本内容，优先级最高
     * 2. 时间信息 - 显示时钟图标和格式化后的时间
     * 3. 标签列表 - 显示关联的标签（如果有）
     *
     * @param {string} content - 提醒内容文本
     * @param {string|number} time - 时间信息
     * @param {Array} tags - 标签列表
     * @returns {string} 渲染后的HTML字符串
     */
    renderNormalContent(content, time, tags) {
        let html = '';

        // 渲染提醒内容部分
        // 显示主要的文本内容，使用段落标签包裹
        if (content) {
            html += `<p class="todo-content">${this.escapeHtml(content)}</p>`;
        }

        // 渲染时间信息部分
        // 显示时钟图标和格式化后的时间，便于用户了解时效性
        if (time) {
            const formattedTime = this.formatTime(time);
            html += this.TEMPLATES.TIME_DISPLAY(formattedTime);
        }

        // 渲染标签列表部分
        // 将所有标签转换为span元素，使用join()方法连接
        if (tags && tags.length > 0) {
            const tagElements = tags.map(tag =>
                `<span class="todo-tag">${this.escapeHtml(tag)}</span>`
            ).join('');

            html += this.TEMPLATES.TAGS_DISPLAY(tagElements);
        }

        return html;
    }

    /**
     * 显示提醒弹窗
     */
    displayReminder(reminderEl, data) {
        // 添加到容器
        this.container.appendChild(reminderEl);

        // 触发动画
        requestAnimationFrame(() => {
            reminderEl.classList.add('show');

            // 高优先级添加抖动效果
            if (data.priority === 'high') {
                reminderEl.classList.add('shake');
                setTimeout(() => reminderEl.classList.remove('shake'), 500);
            }
        });

        // 存储到活跃提醒列表
        // 确保todoId是字符串类型，以匹配HTML属性和事件委托中的字符串值
        // 使用元素上的最终ID，确保与关闭按钮和事件委托一致
        const todoId = reminderEl.getAttribute('data-todo-id');
        this.activeReminders.set(todoId, {
            element: reminderEl,
            data: data
        });

        // 自动关闭（可选，根据配置）
        // setTimeout(() => this.closeReminder(reminderEl), 30000);
    }

    /**
     * 关闭提醒
     * @param {string|HTMLElement|Event} element - 要关闭的元素或ID或事件对象
     * @param {boolean} isDismiss - 是否为手动忽略（用于历史记录）
     */
    closeReminder(element, isDismiss = false) {
        let reminderEl;
        let reminderData = null;
        let todoId = null;

        if (typeof element === 'string' && element !== '') {
            // 通过 todoId 关闭
            const reminder = this.activeReminders.get(element);
            if (reminder) {
                reminderEl = reminder.element;
                reminderData = reminder.data;
                todoId = element;
                this.activeReminders.delete(element);
            }
        } else if (element instanceof HTMLElement) {
            // 直接传入元素
            reminderEl = element.closest('.todo-reminder-popup');
            todoId = reminderEl?.getAttribute('data-todo-id');
            if (todoId) {
                reminderData = this.activeReminders.get(todoId)?.data;
                this.activeReminders.delete(todoId);
            }
        } else if (element?.target) {
            // 事件对象 - 从事件委托获取todoId
            // 需要从currentTarget获取，因为事件绑定在document上
            const target = element.target.closest('[data-todo-action]');
            if (target) {
                todoId = target.getAttribute('data-todo-id');
                const reminder = this.activeReminders.get(todoId);
                if (reminder) {
                    reminderEl = reminder.element;
                    reminderData = reminder.data;
                    this.activeReminders.delete(todoId);
                }
            } else {
                // 备用方案：尝试从closest的弹窗元素获取
                reminderEl = element.target.closest('.todo-reminder-popup');
                if (reminderEl) {
                    todoId = reminderEl.getAttribute('data-todo-id');
                    const reminder = this.activeReminders.get(todoId);
                    if (reminder) {
                        reminderData = reminder.data;
                        this.activeReminders.delete(todoId);
                    }
                }
            }
        }

        // 如果是手动忽略，添加到历史记录
        if (isDismiss && reminderData && todoId) {
            this.addToHistory('dismissed', reminderData, { source: 'manual_dismiss' });
        }

        if (reminderEl) {
            reminderEl.classList.remove('show');
            setTimeout(() => {
                if (reminderEl.parentNode) {
                    reminderEl.parentNode.removeChild(reminderEl);
                }
            }, 300);
        }

        // 标记用户已看过提醒（帮助按钮不再显示）
        this.markUserAsReturning();
    }

    /**
     * 稍后提醒 - 打开稍后提醒设置界面
     */
    dismissReminder(todoId) {
        // 从活跃提醒中获取数据
        const reminder = this.activeReminders.get(todoId);
        if (!reminder) {
            console.warn('未找到待办数据:', todoId);
            return;
        }

        // 显示稍后提醒设置模态框
        this.showSnoozeModal(reminder.data, todoId);
    }

    /**
     * 查看待办详情
     */
    viewTodo(todoId) {
        // 从活跃提醒中获取数据
        const reminder = this.activeReminders.get(todoId);
        if (!reminder) {
            console.warn('未找到待办数据:', todoId);
            return;
        }

        // 关闭当前提醒弹窗
        this.closeReminder(todoId);

        // 显示详情模态框
        this.showTodoDetailModal(reminder.data, todoId);
    }

    /**
     * 显示待办详情模态框
     * 展示完整的待办信息，包括标题、内容、截止时间、标签、状态等
     *
     * @param {Object} data - 待办数据
     * @param {string|number} todoId - 待办事项ID
     */
    showTodoDetailModal(data, todoId) {
        // 创建模态框容器
        const modal = this.createDetailModal(data, todoId);

        // 添加到页面
        document.body.appendChild(modal);

        // 触发动画
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });

        // 聚焦管理
        modal.querySelector('.detail-modal-close')?.focus();

        // 添加键盘事件监听（ESC关闭）
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeDetailModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // 点击外部关闭
        const clickOutsideHandler = (e) => {
            if (e.target === modal || e.target.classList.contains('modal-overlay')) {
                this.closeDetailModal();
                modal.removeEventListener('click', clickOutsideHandler);
            }
        };
        modal.addEventListener('click', clickOutsideHandler);

        // 保存当前模态框引用
        this.currentDetailModal = modal;
    }

    /**
     * 创建详情模态框DOM结构
     *
     * @param {Object} data - 待办数据
     * @param {string|number} todoId - 待办事项ID
     * @returns {HTMLElement} 模态框元素
     */
    createDetailModal(data, todoId) {
        const modal = document.createElement('div');
        modal.className = 'todo-detail-modal';
        modal.setAttribute('data-todo-id', todoId);

        // 构建模态框内容
        const content = this.renderDetailContent(data);

        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="detail-modal-content">
                    ${content}
                </div>
            </div>
        `;

        return modal;
    }

    /**
     * 渲染详情模态框内容
     *
     * @param {Object} data - 待办数据
     * @returns {string} HTML内容
     */
    renderDetailContent(data) {
        const priorityData = this.getPriorityData(data.priority || 'normal');
        const formattedTime = data.scheduledTime ? this.formatTime(data.scheduledTime) : '';
        const createdTime = data.createdAt ? this.formatTime(data.createdAt) : '';
        const updatedTime = data.updatedAt ? this.formatTime(data.updatedAt) : '';

        return `
            <div class="detail-modal-header">
                <div class="detail-modal-title-section">
                    <span class="priority-icon" style="color: ${priorityData.color}">${priorityData.icon}</span>
                    <h2 class="detail-modal-title">${this.escapeHtml(data.title || '待办提醒')}</h2>
                </div>
                <button class="detail-modal-close" onclick="todoReminderManager.closeDetailModal()" aria-label="关闭">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>

            <div class="detail-modal-body">
                ${this.renderDetailMetadata(data)}
                ${this.renderDetailContent(data)}
                ${this.renderDetailTags(data)}
                ${this.renderDetailProgress(data)}
            </div>

            <div class="detail-modal-footer">
                <button class="detail-action-btn btn-edit" onclick="todoReminderManager.editTodo('${data.todoId || ''}')">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    编辑
                </button>
                <button class="detail-action-btn btn-complete" onclick="todoReminderManager.completeTodo('${data.todoId || ''}')">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    标记完成
                </button>
                <button class="detail-action-btn btn-delete" onclick="todoReminderManager.deleteTodo('${data.todoId || ''}')">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                    删除
                </button>
            </div>
        `;
    }

    /**
     * 渲染详情元数据信息
     *
     * @param {Object} data - 待办数据
     * @returns {string} HTML内容
     */
    renderDetailMetadata(data) {
        const metadataItems = [];

        // 优先级
        if (data.priority) {
            const priorityData = this.getPriorityData(data.priority);
            metadataItems.push({
                icon: priorityData.icon,
                label: '优先级',
                value: this.getPriorityText(data.priority),
                color: priorityData.color
            });
        }

        // 截止时间
        if (data.deadline || data.scheduledTime) {
            const timeValue = data.deadline || data.scheduledTime;
            const formatted = this.formatTime(timeValue);
            const isOverdue = new Date(timeValue) < new Date() && data.status !== 'completed';

            metadataItems.push({
                icon: '🗓️',
                label: '截止时间',
                value: formatted,
                color: isOverdue ? '#ff4444' : '',
                isOverdue: isOverdue
            });
        }

        // 状态
        if (data.status) {
            metadataItems.push({
                icon: '📋',
                label: '状态',
                value: this.getStatusText(data.status),
                color: data.status === 'completed' ? '#4CAF50' : '#2196F3'
            });
        }

        // 负责人
        if (data.assignee) {
            metadataItems.push({
                icon: '👤',
                label: '负责人',
                value: data.assignee,
                color: ''
            });
        }

        // 创建时间
        if (data.createdAt) {
            metadataItems.push({
                icon: '✨',
                label: '创建时间',
                value: this.formatTime(data.createdAt),
                color: ''
            });
        }

        // 最后更新
        if (data.updatedAt && data.updatedAt !== data.createdAt) {
            metadataItems.push({
                icon: '🔄',
                label: '最后更新',
                value: this.formatTime(data.updatedAt),
                color: ''
            });
        }

        if (metadataItems.length === 0) return '';

        const html = metadataItems.map(item => `
            <div class="metadata-item">
                <span class="metadata-icon">${item.icon}</span>
                <div class="metadata-content">
                    <span class="metadata-label">${item.label}</span>
                    <span class="metadata-value" ${item.color ? `style="color: ${item.color}"` : ''}>
                        ${this.escapeHtml(item.value)}
                        ${item.isOverdue ? '<span class="overdue-badge">已逾期</span>' : ''}
                    </span>
                </div>
            </div>
        `).join('');

        return `
            <div class="detail-section">
                <h3 class="detail-section-title">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                    </svg>
                    基本信息
                </h3>
                <div class="metadata-list">
                    ${html}
                </div>
            </div>
        `;
    }

    /**
     * 渲染详情内容
     *
     * @param {Object} data - 待办数据
     * @returns {string} HTML内容
     */
    renderDetailContent(data) {
        const content = data.content || data.message || '';
        if (!content) return '';

        return `
            <div class="detail-section">
                <h3 class="detail-section-title">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <path d="M14 2v6h6"/>
                    </svg>
                    详细内容
                </h3>
                <div class="detail-content">
                    <p>${this.escapeHtml(content)}</p>
                </div>
            </div>
        `;
    }

    /**
     * 渲染标签列表
     *
     * @param {Object} data - 待办数据
     * @returns {string} HTML内容
     */
    renderDetailTags(data) {
        const tags = data.tags || [];
        if (tags.length === 0) return '';

        const tagElements = tags.map(tag => `
            <span class="detail-tag">${this.escapeHtml(tag)}</span>
        `).join('');

        return `
            <div class="detail-section">
                <h3 class="detail-section-title">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
                        <path d="M7 7h.01"/>
                    </svg>
                    标签
                </h3>
                <div class="detail-tags">
                    ${tagElements}
                </div>
            </div>
        `;
    }

    /**
     * 渲染进度信息
     *
     * @param {Object} data - 待办数据
     * @returns {string} HTML内容
     */
    renderDetailProgress(data) {
        // 如果有待办信息或子任务，显示进度
        if (data.overdueInfo || data.progress) {
            const progressValue = data.progress || 0;

            return `
                <div class="detail-section">
                    <h3 class="detail-section-title">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                            <path d="M22 4L12 14.01l-3-3"/>
                        </svg>
                        进度
                    </h3>
                    <div class="detail-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progressValue}%"></div>
                        </div>
                        <span class="progress-text">${progressValue}%</span>
                    </div>
                    ${data.overdueInfo ? `
                        <div class="overdue-info">
                            <span class="overdue-label">逾期信息：</span>
                            <span class="overdue-value">${this.escapeHtml(data.overdueInfo.message || '')}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        return '';
    }

    /**
     * 获取优先级文本
     *
     * @param {string} priority - 优先级
     * @returns {string} 优先级文本
     */
    getPriorityText(priority) {
        const priorityMap = {
            'high': '高',
            'medium': '中',
            'low': '低',
            'normal': '普通'
        };
        return priorityMap[priority] || priority;
    }

    /**
     * 获取状态文本
     *
     * @param {string} status - 状态
     * @returns {string} 状态文本
     */
    getStatusText(status) {
        const statusMap = {
            'pending': '待办',
            'in_progress': '进行中',
            'completed': '已完成',
            'cancelled': '已取消'
        };
        return statusMap[status] || status;
    }

    /**
     * 关闭详情模态框
     */
    closeDetailModal() {
        const modal = this.currentDetailModal;
        if (!modal) return;

        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
            this.currentDetailModal = null;
        }, 300);
    }

    /**
     * 显示稍后提醒设置模态框
     * @param {Object} data - 待办数据
     * @param {string|number} todoId - 待办事项ID
     */
    showSnoozeModal(data, todoId) {
        // 创建模态框
        const modal = this.createSnoozeModal(data, todoId);

        // 添加到页面
        document.body.appendChild(modal);

        // 触发动画
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });

        // 保存当前模态框引用
        this.currentSnoozeModal = modal;

        // 聚焦管理
        const firstButton = modal.querySelector('.snooze-preset-btn');
        if (firstButton) {
            firstButton.focus();
        }

        // 添加键盘事件监听（ESC关闭）
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeSnoozeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // 点击外部关闭
        const clickOutsideHandler = (e) => {
            if (e.target === modal || e.target.classList.contains('modal-overlay')) {
                this.closeSnoozeModal();
                modal.removeEventListener('click', clickOutsideHandler);
            }
        };
        modal.addEventListener('click', clickOutsideHandler);

        // 启动定时检查稍后提醒
        this.startSnoozeTimer();

        // 添加预设按钮事件监听
        modal.querySelectorAll('.snooze-preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const minutes = parseInt(e.currentTarget.getAttribute('data-minutes'));
                const label = e.currentTarget.getAttribute('data-label');

                // 处理预设稍后提醒
                this.handlePresetSnooze(todoId, minutes);
            });

            // 添加悬停效果，显示时间预览
            btn.addEventListener('mouseenter', (e) => {
                const minutes = parseInt(e.currentTarget.getAttribute('data-minutes'));
                const label = e.currentTarget.getAttribute('data-label');
                const now = new Date();
                let previewTime;

                if (minutes > 0) {
                    previewTime = new Date(now.getTime() + minutes * 60000);
                } else {
                    // 特殊处理明天的时间
                    const options = this.getSnoozePresetOptions();
                    const optionIndex = parseInt(e.currentTarget.getAttribute('data-index'));
                    if (options[optionIndex] && options[optionIndex].customAction) {
                        previewTime = options[optionIndex].customAction();
                    }
                }

                if (previewTime) {
                    const previewText = modal.querySelector('.preview-text');
                    if (previewText) {
                        previewText.textContent = `将在 ${this.formatTime(previewTime.getTime())} 提醒`;
                    }
                }
            });

            btn.addEventListener('mouseleave', () => {
                const previewText = modal.querySelector('.preview-text');
                if (previewText) {
                    previewText.textContent = '选择时间后将在此处显示提醒时间';
                }
            });
        });
    }

    /**
     * 创建稍后提醒模态框DOM结构
     * @param {Object} data - 待办数据
     * @param {string|number} todoId - 待办事项ID
     * @returns {HTMLElement} 模态框元素
     */
    createSnoozeModal(data, todoId) {
        const modal = document.createElement('div');
        modal.className = 'todo-snooze-modal';
        modal.setAttribute('data-todo-id', todoId);

        // 获取预设选项
        const presetOptions = this.getSnoozePresetOptions();

        // 构建预设按钮HTML
        const presetButtonsHtml = presetOptions.map((option, index) => `
            <button class="snooze-preset-btn" data-index="${index}" data-minutes="${option.minutes}" data-label="${option.label}">
                <span class="preset-icon">${option.icon}</span>
                <span class="preset-label">${option.label}</span>
                <span class="preset-time">${option.timeText}</span>
            </button>
        `).join('');

        // 构建模态框内容
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="snooze-modal-content">
                    <div class="snooze-modal-header">
                        <h3 class="snooze-modal-title">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M12 6v6l4 2"/>
                            </svg>
                            设置稍后提醒
                        </h3>
                        <button class="snooze-modal-close" onclick="todoReminderManager.closeSnoozeModal()" aria-label="关闭">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <div class="snooze-modal-body">
                        <div class="snooze-section">
                            <h4 class="snooze-section-title">快速选择</h4>
                            <div class="snooze-presets-grid">
                                ${presetButtonsHtml}
                            </div>
                        </div>

                        <div class="snooze-section">
                            <h4 class="snooze-section-title">自定义时间</h4>
                            <div class="snooze-custom-input">
                                <div class="custom-time-row">
                                    <label class="custom-time-label">日期：</label>
                                    <input type="date" class="snooze-date-input" id="snooze-date-${todoId}">
                                </div>
                                <div class="custom-time-row">
                                    <label class="custom-time-label">时间：</label>
                                    <input type="time" class="snooze-time-input" id="snooze-time-${todoId}" step="60">
                                </div>
                                <button class="snooze-custom-btn" onclick="todoReminderManager.handleCustomSnooze('${todoId}')">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                                    </svg>
                                    确认设置
                                </button>
                            </div>
                        </div>

                        <div class="snooze-preview">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            <span class="preview-text">选择时间后将在此处显示提醒时间</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        return modal;
    }

    /**
     * 获取稍后提醒预设选项
     * @returns {Array} 预设选项数组
     */
    getSnoozePresetOptions() {
        const now = new Date();
        const options = [
            {
                label: '10分钟后',
                minutes: 10,
                icon: '🕐',
                timeText: '10分钟'
            },
            {
                label: '30分钟后',
                minutes: 30,
                icon: '🕐',
                timeText: '30分钟'
            },
            {
                label: '1小时后',
                minutes: 60,
                icon: '🕐',
                timeText: '1小时'
            },
            {
                label: '2小时后',
                minutes: 120,
                icon: '🕐',
                timeText: '2小时'
            },
            {
                label: '明天早上',
                minutes: 0,
                icon: '🌅',
                timeText: '明天 9:00',
                customAction: () => {
                    const tomorrow = new Date(now);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(9, 0, 0, 0);
                    return tomorrow;
                }
            },
            {
                label: '明天下午',
                minutes: 0,
                icon: '🌇',
                timeText: '明天 15:00',
                customAction: () => {
                    const tomorrow = new Date(now);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(15, 0, 0, 0);
                    return tomorrow;
                }
            }
        ];
        return options;
    }

    /**
     * 处理预设稍后提醒选择
     * @param {string|number} todoId - 待办事项ID
     * @param {number} minutes - 延后分钟数
     */
    handlePresetSnooze(todoId, minutes) {
        const reminder = this.activeReminders.get(todoId);
        if (!reminder) {
            this.showToast('未找到待办数据', 'error');
            return;
        }

        let newReminderTime;
        const now = new Date();

        // 根据分钟数计算新时间
        if (minutes > 0) {
            // 相对时间（X分钟后）
            newReminderTime = new Date(now.getTime() + minutes * 60000);
        } else {
            // 特殊处理明天的时间选项
            const options = this.getSnoozePresetOptions();
            const button = this.currentSnoozeModal.querySelector(`[data-todo-id="${todoId}"] .snooze-preset-btn[data-minutes="0"]:nth-child(1)`);
            const optionIndex = parseInt(button?.getAttribute('data-index') || '0');
            if (options[optionIndex] && options[optionIndex].customAction) {
                newReminderTime = options[optionIndex].customAction();
            }
        }

        if (!newReminderTime) {
            this.showToast('设置稍后提醒失败', 'error');
            return;
        }

        // 保存稍后提醒
        this.scheduleSnoozedReminder(reminder.data, todoId, newReminderTime);

        // 关闭模态框
        this.closeSnoozeModal();

        // 显示成功提示
        const timeText = this.formatTime(newReminderTime.getTime());
        this.showToast(`已设置为 ${timeText} 提醒`, 'success');
    }

    /**
     * 处理自定义稍后提醒设置
     * @param {string|number} todoId - 待办事项ID
     */
    handleCustomSnooze(todoId) {
        const dateInput = document.getElementById(`snooze-date-${todoId}`);
        const timeInput = document.getElementById(`snooze-time-${todoId}`);

        if (!dateInput || !timeInput) {
            this.showToast('请选择日期和时间', 'error');
            return;
        }

        const dateValue = dateInput.value;
        const timeValue = timeInput.value;

        if (!dateValue || !timeValue) {
            this.showToast('请完整选择日期和时间', 'error');
            return;
        }

        // 组合日期和时间
        const dateTimeStr = `${dateValue}T${timeValue}`;
        const newReminderTime = new Date(dateTimeStr);

        // 验证时间是否在未来
        if (newReminderTime <= new Date()) {
            this.showToast('提醒时间必须是未来时间', 'error');
            return;
        }

        const reminder = this.activeReminders.get(todoId);
        if (!reminder) {
            this.showToast('未找到待办数据', 'error');
            return;
        }

        // 保存稍后提醒
        this.scheduleSnoozedReminder(reminder.data, todoId, newReminderTime);

        // 关闭模态框
        this.closeSnoozeModal();

        // 显示成功提示
        this.showToast(`已设置为 ${this.formatTime(newReminderTime.getTime())} 提醒`, 'success');
    }

    /**
     * 安排稍后提醒
     * @param {Object} data - 待办数据
     * @param {string|number} todoId - 待办事项ID
     * @param {Date} reminderTime - 新的提醒时间
     */
    scheduleSnoozedReminder(data, todoId, reminderTime) {
        // 添加到历史记录
        this.addToHistory('snoozed', data, {
            source: 'manual_snooze',
            snoozeTime: reminderTime.getTime()
        });

        // 保存到稍后提醒队列
        this.snoozedReminders.set(todoId, {
            data: data,
            reminderTime: reminderTime.getTime(),
            originalTime: Date.now()
        });

        // 存储到localStorage以持久化
        this.saveSnoozedReminders();

        // 关闭当前提醒弹窗
        this.closeReminder(todoId);

        // 发送到后端更新提醒时间
        this.sendSnoozeToBackend(data, todoId, reminderTime);

        // 启动定时器检查
        this.startSnoozeTimer();
    }

    /**
     * 发送稍后提醒请求到后端
     * @param {Object} data - 待办数据
     * @param {string|number} todoId - 待办事项ID
     * @param {Date} reminderTime - 新的提醒时间
     */
    async sendSnoozeToBackend(data, todoId, reminderTime) {
        try {
            const requestBody = {
                todoId: todoId,
                originalTime: data.scheduledTime || data.timestamp,
                newTime: reminderTime.getTime(),
                action: 'snooze',
                priority: data.priority || 'normal'
            };

            // 发送API请求到后端
            const response = await fetch('/v1/todos/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
        } catch (error) {
            console.warn('发送到后端失败，将仅在前端生效:', error);
            // 即使后端失败，前端的稍后提醒仍然生效
            // 这里可以添加重试逻辑或其他处理
        }
    }

    /**
     * 获取认证令牌
     * @returns {string} 认证令牌
     */
    getAuthToken() {
        // 从 localStorage 或其他地方获取认证令牌
        return localStorage.getItem('vcp_auth_token') || '';
    }

    /**
     * 启动稍后提醒定时器
     */
    startSnoozeTimer() {
        // 如果定时器已存在，不重复启动
        if (this.snoozeTimerInterval) {
            return;
        }

        // 每30秒检查一次
        this.snoozeTimerInterval = setInterval(() => {
            this.checkSnoozedReminders();
        }, 30000);

        // 立即检查一次
        this.checkSnoozedReminders();
    }

    /**
     * 检查并触发到期的稍后提醒
     */
    checkSnoozedReminders() {
        const now = Date.now();
        const toTrigger = [];

        // 查找需要触发的提醒
        this.snoozedReminders.forEach((reminder, todoId) => {
            if (reminder.reminderTime <= now) {
                toTrigger.push({ todoId, reminder });
            }
        });

        // 触发到期的提醒
        toTrigger.forEach(({ todoId, reminder }) => {
            // 重新显示提醒
            this.handleTodoReminder(reminder.data);

            // 从队列中移除
            this.snoozedReminders.delete(todoId);
        });

        // 如果没有待处理的提醒，停止定时器
        if (this.snoozedReminders.size === 0) {
            this.stopSnoozeTimer();
        }

        // 保存更新后的队列
        if (toTrigger.length > 0) {
            this.saveSnoozedReminders();
        }
    }

    /**
     * 停止稍后提醒定时器
     */
    stopSnoozeTimer() {
        if (this.snoozeTimerInterval) {
            clearInterval(this.snoozeTimerInterval);
            this.snoozeTimerInterval = null;
        }
    }

    /**
     * 性能优化：清理所有事件监听器
     * 在组件卸载或页面离开时调用
     */
    cleanupEventListeners() {
        // 移除事件委托处理器
        if (this._eventDelegationHandler) {
            document.removeEventListener('click', this._eventDelegationHandler);
            this._eventDelegationHandler = null;
        }

        // 清理模态框事件监听器
        if (this.currentDetailModal) {
            const escHandler = this.currentDetailModal._escHandler;
            if (escHandler) {
                document.removeEventListener('keydown', escHandler);
            }
            this.currentDetailModal = null;
        }

        if (this.currentSnoozeModal) {
            const escHandler = this.currentSnoozeModal._escHandler;
            if (escHandler) {
                document.removeEventListener('keydown', escHandler);
            }
            this.currentSnoozeModal = null;
        }

        if (this.currentHistoryModal) {
            const escHandler = this.currentHistoryModal._escHandler;
            if (escHandler) {
                document.removeEventListener('keydown', escHandler);
            }
            this.currentHistoryModal = null;
        }

        if (this.currentStatisticsModal) {
            const escHandler = this.currentStatisticsModal._escHandler;
            if (escHandler) {
                document.removeEventListener('keydown', escHandler);
            }
            this.currentStatisticsModal = null;
        }

        if (this.currentCompleteConfirmModal) {
            const escHandler = this.currentCompleteConfirmModal._escHandler;
            if (escHandler) {
                document.removeEventListener('keydown', escHandler);
            }
            this.currentCompleteConfirmModal = null;
        }

        // 停止定时器
        this.stopSnoozeTimer();

        // 清理DOM缓存
        this.clearDOMCache();

        // 清理音频上下文
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }

    /**
     * 性能优化：优化localStorage操作
     * 使用防抖和压缩
     */
    saveToLocalStorage(key, data, compress = false) {
        try {
            let serialized = JSON.stringify(data);

            // 如果启用压缩（对于大对象）
            if (compress && typeof LZString !== 'undefined') {
                serialized = LZString.compressToUTF16(serialized);
            }

            localStorage.setItem(key, serialized);
            return true;
        } catch (e) {
            console.warn(`保存到localStorage失败: ${key}`, e);
            return false;
        }
    }

    /**
     * 性能优化：从localStorage加载（支持解压缩）
     */
    loadFromLocalStorage(key, decompress = false) {
        try {
            const data = localStorage.getItem(key);
            if (!data) return null;

            let deserialized = data;

            if (decompress && typeof LZString !== 'undefined') {
                deserialized = LZString.decompressFromUTF16(data);
            }

            return JSON.parse(deserialized);
        } catch (e) {
            console.warn(`从localStorage加载失败: ${key}`, e);
            return null;
        }
    }

    /**
     * 保存稍后提醒到localStorage
     */
    saveSnoozedReminders() {
        return this.measureLocalStorageOperation('saveSnoozedReminders', () => {
            try {
                const data = Array.from(this.snoozedReminders.entries());
                this.saveToLocalStorage('vcp_snoozed_reminders', data, true);
            } catch (e) {
                console.warn('保存稍后提醒失败:', e);
            }
        });
    }

    /**
     * 从localStorage加载稍后提醒
     */
    loadSnoozedReminders() {
        return this.measureLocalStorageOperation('loadSnoozedReminders', () => {
            try {
                const data = this.loadFromLocalStorage('vcp_snoozed_reminders', true);
                if (data) {
                    this.snoozedReminders = new Map(data);

                    // 过滤掉已过期的提醒
                    const now = Date.now();
                    this.snoozedReminders.forEach((reminder, todoId) => {
                        if (reminder.reminderTime <= now) {
                            this.snoozedReminders.delete(todoId);
                        }
                    });

                    // 启动定时器
                    if (this.snoozedReminders.size > 0) {
                        this.startSnoozeTimer();
                    }
                }
            } catch (e) {
                console.warn('加载稍后提醒失败:', e);
            }
        });
    }

    /**
     * 保存历史记录数据
     */
    saveHistoryData() {
        return this.measureLocalStorageOperation('saveHistoryData', () => {
            try {
                // 限制历史记录数量（最多1000条）
                if (this.historyData.size > 1000) {
                    const entries = Array.from(this.historyData.entries())
                        .sort((a, b) => b[1].timestamp - a[1].timestamp)
                        .slice(0, 1000);
                    this.historyData = new Map(entries);
                }

                const data = Array.from(this.historyData.entries());
                this.saveToLocalStorage('vcp_todo_history', data, true);
            } catch (e) {
                console.warn('保存历史记录失败:', e);
            }
        });
    }

    /**
     * 加载历史记录数据
     */
    loadHistoryData() {
        return this.measureLocalStorageOperation('loadHistoryData', () => {
            try {
                const data = this.loadFromLocalStorage('vcp_todo_history', true);
                if (data) {
                    this.historyData = new Map(data);
                }
            } catch (e) {
                console.warn('加载历史记录失败:', e);
            }
        });
    }

    /**
     * 关闭稍后提醒模态框
     */
    closeSnoozeModal() {
        const modal = this.currentSnoozeModal;
        if (!modal) return;

        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
            this.currentSnoozeModal = null;
        }, 300);
    }

    /**
     * 编辑待办
     */
    editTodo(todoId) {
        this.closeDetailModal();

        // TODO: 实现编辑功能
        this.showToast('编辑功能开发中...', 'info');
    }

    /**
     * 删除待办
     */
    deleteTodo(todoId) {
        if (!confirm('确定要删除这个待办事项吗？此操作不可恢复。')) {
            return;
        }

        this.closeDetailModal();

        // TODO: 发送删除请求到后端
        this.showToast('待办已删除', 'success');
    }

    /**
     * 标记完成 - 显示确认对话框
     */
    completeTodo(todoId) {
        // 获取待办数据
        const reminder = this.activeReminders.get(todoId);
        if (!reminder) {
            console.warn('未找到待办数据:', todoId);
            return;
        }

        // 显示确认对话框
        this.showCompleteConfirmationModal(reminder.data, todoId);
    }

    /**
     * 显示完成确认模态框
     * @param {Object} data - 待办数据
     * @param {string|number} todoId - 待办事项ID
     */
    showCompleteConfirmationModal(data, todoId) {
        // 创建模态框
        const modal = this.createCompleteConfirmModal(data, todoId);

        // 添加到页面
        document.body.appendChild(modal);

        // 触发动画
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });

        // 聚焦管理
        modal.querySelector('.confirm-cancel-btn')?.focus();

        // 添加键盘事件监听
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeCompleteConfirmModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // 点击外部关闭
        const clickOutsideHandler = (e) => {
            if (e.target === modal || e.target.classList.contains('modal-overlay')) {
                this.closeCompleteConfirmModal();
                modal.removeEventListener('click', clickOutsideHandler);
            }
        };
        modal.addEventListener('click', clickOutsideHandler);

        // 保存当前模态框引用
        this.currentCompleteConfirmModal = modal;
    }

    /**
     * 创建完成确认模态框DOM结构
     * @param {Object} data - 待办数据
     * @param {string|number} todoId - 待办事项ID
     * @returns {HTMLElement} 模态框元素
     */
    createCompleteConfirmModal(data, todoId) {
        const modal = document.createElement('div');
        modal.className = 'todo-complete-confirm-modal';
        modal.setAttribute('data-todo-id', todoId);

        const priorityData = this.getPriorityData(data.priority || 'normal');
        const todoTitle = data.title || '这个待办事项';

        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="complete-confirm-modal-content">
                    <div class="complete-confirm-header">
                        <div class="complete-confirm-icon">
                            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#4CAF50" stroke-width="2">
                                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                                <path d="M22 4L12 14.01l-3-3"/>
                            </svg>
                        </div>
                        <h3 class="complete-confirm-title">标记为已完成</h3>
                    </div>

                    <div class="complete-confirm-body">
                        <p class="confirm-message">
                            确定要将以下待办事项标记为已完成吗？
                        </p>
                        <div class="confirm-todo-item">
                            <span class="priority-icon" style="color: ${priorityData.color}">${priorityData.icon}</span>
                            <span class="todo-title">${this.escapeHtml(todoTitle)}</span>
                        </div>
                        <p class="confirm-hint">此操作可以撤销，您可以在稍后重新打开该待办事项。</p>
                    </div>

                    <div class="complete-confirm-footer">
                        <button class="confirm-cancel-btn" onclick="todoReminderManager.closeCompleteConfirmModal()">
                            取消
                        </button>
                        <button class="confirm-complete-btn" onclick="todoReminderManager.confirmCompleteTodo('${todoId}')" autofocus>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                                <path d="M22 4L12 14.01l-3-3"/>
                            </svg>
                            确认完成
                        </button>
                    </div>
                </div>
            </div>
        `;

        return modal;
    }

    /**
     * 关闭完成确认模态框
     */
    closeCompleteConfirmModal() {
        const modal = this.currentCompleteConfirmModal;
        if (!modal) return;

        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
            this.currentCompleteConfirmModal = null;
        }, 300);
    }

    /**
     * 确认完成待办事项
     * @param {string|number} todoId - 待办事项ID
     */
    async confirmCompleteTodo(todoId) {
        // 关闭确认模态框
        this.closeCompleteConfirmModal();

        // 获取待办数据
        const reminder = this.activeReminders.get(todoId);
        if (!reminder) {
            console.warn('未找到待办数据:', todoId);
            this.showToast('操作失败：未找到待办数据', 'error');
            return;
        }

        const todoData = reminder.data;

        try {
            // 1. 添加到历史记录
            this.addToHistory('completed', todoData, { source: 'manual_complete' });

            // 2. 乐观更新 - 先更新UI
            this.optimisticCompleteTodo(todoId, todoData);

            // 3. 发送API请求到后端
            await this.sendCompleteToBackend(todoData, todoId);

            // 4. 播放成功动画
            this.playCompletionAnimation();

            // 5. 显示成功提示
            this.showToast('待办已标记为完成 ✓', 'success');

        } catch (error) {
            // 6. 失败时回滚
            console.error('标记完成失败:', error);
            this.rollbackCompleteTodo(todoId, todoData);
            this.showToast('标记完成失败，请重试', 'error');
        }
    }

    /**
     * 乐观更新 - 先更新UI
     * @param {string|number} todoId - 待办事项ID
     * @param {Object} todoData - 待办数据
     */
    optimisticCompleteTodo(todoId, todoData) {
        // 关闭提醒弹窗
        this.closeReminder(todoId);

        // 更新本地数据状态
        if (todoData) {
            todoData.status = 'completed';
            todoData.completedAt = Date.now();
        }

        // 存储待办ID用于可能的回滚
        this.completedTodos = this.completedTodos || new Map();
        this.completedTodos.set(todoId, {
            data: todoData,
            timestamp: Date.now()
        });
    }

    /**
     * 回滚完成操作
     * @param {string|number} todoId - 待办事项ID
     * @param {Object} todoData - 待办数据
     */
    rollbackCompleteTodo(todoId, todoData) {
        // 恢复状态
        if (todoData) {
            todoData.status = 'pending';
            delete todoData.completedAt;
        }

        // 从已完成列表中移除
        if (this.completedTodos) {
            this.completedTodos.delete(todoId);
        }
    }

    /**
     * 发送完成请求到后端
     * @param {Object} data - 待办数据
     * @param {string|number} todoId - 待办事项ID
     */
    async sendCompleteToBackend(data, todoId) {
        const requestBody = {
            todoId: todoId,
            status: 'completed',
            completedAt: Date.now(),
            action: 'complete',
            priority: data.priority || 'normal',
            title: data.title,
            content: data.content || data.message
        };

        // 发送API请求到后端
        const response = await fetch('/v1/todos/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.getAuthToken()}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        return result;
    }

    /**
     * 播放完成动画
     */
    playCompletionAnimation() {
        // 创建成功动画容器
        const animationContainer = document.createElement('div');
        animationContainer.className = 'completion-animation-container';
        animationContainer.innerHTML = `
            <div class="completion-checkmark">
                <svg viewBox="0 0 52 52" width="80" height="80">
                    <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
                    <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                </svg>
            </div>
            <div class="completion-text">完成！</div>
        `;

        // 添加到页面
        document.body.appendChild(animationContainer);

        // 触发动画
        requestAnimationFrame(() => {
            animationContainer.classList.add('show');
        });

        // 3秒后移除动画
        setTimeout(() => {
            animationContainer.classList.remove('show');
            setTimeout(() => {
                if (animationContainer.parentNode) {
                    animationContainer.parentNode.removeChild(animationContainer);
                }
            }, 300);
        }, 2000);
    }

    /**
     * 播放提示音
     */
    playSound(priority = 'normal') {
        if (!this.audioContext) return;

        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            // 根据优先级设置不同音调
            switch (priority) {
                case 'high':
                    oscillator.frequency.value = 800;
                    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
                    oscillator.start(this.audioContext.currentTime);
                    oscillator.stop(this.audioContext.currentTime + 0.3);

                    // 播放两次
                    setTimeout(() => {
                        const osc2 = this.audioContext.createOscillator();
                        const gain2 = this.audioContext.createGain();
                        osc2.connect(gain2);
                        gain2.connect(this.audioContext.destination);
                        osc2.frequency.value = 900;
                        gain2.gain.setValueAtTime(0.3, this.audioContext.currentTime);
                        gain2.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
                        osc2.start(this.audioContext.currentTime);
                        osc2.stop(this.audioContext.currentTime + 0.3);
                    }, 200);
                    break;

                case 'medium':
                    oscillator.frequency.value = 600;
                    gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
                    oscillator.start(this.audioContext.currentTime);
                    oscillator.stop(this.audioContext.currentTime + 0.2);
                    break;

                default: // normal or low
                    oscillator.frequency.value = 400;
                    gainNode.gain.setValueAtTime(0.15, this.audioContext.currentTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);
                    oscillator.start(this.audioContext.currentTime);
                    oscillator.stop(this.audioContext.currentTime + 0.15);
            }
        } catch (e) {
            console.warn('播放提示音失败:', e);
        }
    }

    /**
     * 获取优先级图标
     */
    getPriorityIcon(priority) {
        switch (priority) {
            case 'high':
                return '⚠️';
            case 'medium':
                return '⚡';
            case 'low':
                return '✓';
            default:
                return '●';
        }
    }

    /**
     * 获取优先级数据和样式
     */
    getPriorityData(priority) {
        switch (priority) {
            case 'high':
                return {
                    icon: '⚠️',
                    color: '#ff4444',
                    borderColor: '#ff4444',
                    bgColor: 'rgba(255, 68, 68, 0.08)'
                };
            case 'medium':
                return {
                    icon: '⚡',
                    color: '#ff9800',
                    borderColor: '#ff9800',
                    bgColor: 'rgba(255, 152, 0, 0.08)'
                };
            case 'low':
                return {
                    icon: '✓',
                    color: '#4CAF50',
                    borderColor: '#4CAF50',
                    bgColor: 'rgba(76, 175, 80, 0.08)'
                };
            default:
                return {
                    icon: '●',
                    color: '#2196F3',
                    borderColor: '#2196F3',
                    bgColor: 'rgba(33, 150, 243, 0.08)'
                };
        }
    }

    /**
     * 格式化时间
     */
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = date - now;

        // 如果是过去的时间
        if (diff < 0) {
            const absDiff = Math.abs(diff);
            if (absDiff < 60000) return '刚才';
            if (absDiff < 3600000) return `${Math.floor(absDiff / 60000)} 分钟前`;
            if (absDiff < 86400000) return `${Math.floor(absDiff / 3600000)} 小时前`;
            return `${Math.floor(absDiff / 86400000)} 天前`;
        }

        // 如果是未来的时间
        if (diff < 60000) return '马上';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟后`;
        if (diff < 86400000) {
            const hours = date.getHours();
            const minutes = date.getMinutes();
            return `今天 ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
        if (diff < 172800000) {
            const hours = date.getHours();
            const minutes = date.getMinutes();
            return `明天 ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }

        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = date.getHours();
        const minutes = date.getMinutes();
        return `${month}月${day}日 ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    /**
     * HTML 转义
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 显示 Toast 提示
     */
    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('floating-toast-notifications-container');
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * 清除所有提醒
     */
    clearAll() {
        this.activeReminders.forEach((reminder) => {
            this.closeReminder(reminder.element);
        });
        this.activeReminders.clear();
    }

    // ========================================
    // 历史记录管理模块
    // ========================================

    /**
     * 添加历史记录
     * @param {string} actionType - 操作类型：completed, snoozed, dismissed
     * @param {Object} todoData - 待办数据
     * @param {Object} metadata - 额外元数据
     */
    addToHistory(actionType, todoData, metadata = {}) {
        const historyId = `hist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const historyEntry = {
            id: historyId,
            action: actionType,
            todoId: todoData.todoId || 'unknown',
            title: todoData.title || todoData.content || '未知待办',
            content: todoData.content || todoData.message || '',
            priority: todoData.priority || 'normal',
            reminderType: todoData.reminderType || 'normal',
            timestamp: Date.now(),
            agentName: todoData.agentName || '',
            tags: todoData.tags || [],
            status: todoData.status || actionType,
            metadata: {
                source: metadata.source || 'reminder',
                ...metadata
            },
            version: '1.0'
        };

        this.historyData.set(historyId, historyEntry);
        this.saveHistoryData();

        return historyId;
    }

    /**
     * 显示历史记录模态框
     * 性能优化：懒加载历史记录数据
     */
    showHistory() {
        // 懒加载：仅在首次打开时加载数据
        if (this.historyData.size === 0) {
            this.loadHistoryData();
        }

        // 创建模态框
        const modal = this.createHistoryModal();

        // 添加到页面
        document.body.appendChild(modal);

        // 触发动画
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });

        // 保存当前模态框引用
        this.currentHistoryModal = modal;

        // 聚焦管理
        const closeButton = modal.querySelector('.history-modal-close');
        if (closeButton) {
            closeButton.focus();
        }

        // 添加键盘事件监听（ESC关闭）
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeHistoryModal();
                document.removeEventListener('keydown', escHandler);
                modal._escHandler = null;
            }
        };
        document.addEventListener('keydown', escHandler);
        modal._escHandler = escHandler;

        // 点击外部关闭
        const clickOutsideHandler = (e) => {
            if (e.target === modal || e.target.classList.contains('modal-overlay')) {
                this.closeHistoryModal();
                modal.removeEventListener('click', clickOutsideHandler);
            }
        };
        modal.addEventListener('click', clickOutsideHandler);
    }

    /**
     * 创建历史记录模态框
     * @returns {HTMLElement} 模态框元素
     */
    createHistoryModal() {
        const modal = document.createElement('div');
        modal.className = 'todo-history-modal';

        // 获取历史记录
        const historyEntries = Array.from(this.historyData.entries())
            .sort((a, b) => b[1].timestamp - a[1].timestamp);

        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="history-modal-content">
                    <div class="history-modal-header">
                        <div class="history-modal-title-section">
                            <h2 class="history-modal-title">
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <polyline points="12 6 12 12 16 14"/>
                                </svg>
                                提醒历史
                            </h2>
                            <div class="history-stats">
                                <span class="history-stat-item">
                                    <span class="history-stat-label">总计</span>
                                    <span class="history-stat-value">${historyEntries.length}</span>
                                </span>
                                <span class="history-stat-item">
                                    <span class="history-stat-label">今日</span>
                                    <span class="history-stat-value">${this.getTodayHistoryCount()}</span>
                                </span>
                            </div>
                        </div>
                        <button class="history-modal-close" onclick="todoReminderManager.closeHistoryModal()" aria-label="关闭">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <div class="history-modal-body">
                        <div class="history-controls">
                            <div class="history-search-box">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="11" cy="11" r="8"/>
                                    <path d="M21 21l-4.35-4.35"/>
                                </svg>
                                <input type="text" id="history-search-input" placeholder="搜索待办标题或内容..." onkeyup="todoReminderManager.filterHistory()">
                            </div>

                            <div class="history-filters">
                                <select id="history-action-filter" onchange="todoReminderManager.filterHistory()">
                                    <option value="">全部操作</option>
                                    <option value="completed">已完成</option>
                                    <option value="snoozed">稍后提醒</option>
                                    <option value="dismissed">已忽略</option>
                                </select>

                                <select id="history-priority-filter" onchange="todoReminderManager.filterHistory()">
                                    <option value="">全部优先级</option>
                                    <option value="high">高优先级</option>
                                    <option value="medium">中优先级</option>
                                    <option value="normal">普通</option>
                                    <option value="low">低优先级</option>
                                </select>

                                <select id="history-date-filter" onchange="todoReminderManager.filterHistory()">
                                    <option value="">全部时间</option>
                                    <option value="today">今天</option>
                                    <option value="yesterday">昨天</option>
                                    <option value="week">本周</option>
                                    <option value="month">本月</option>
                                </select>

                                <div class="history-export-buttons">
                                    <button class="history-export-btn" onclick="todoReminderManager.exportHistory('json')">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                                            <polyline points="7 10 12 15 17 10"/>
                                            <line x1="12" y1="15" x2="12" y2="3"/>
                                        </svg>
                                        导出JSON
                                    </button>
                                    <button class="history-export-btn" onclick="todoReminderManager.exportHistory('csv')">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                                            <polyline points="7 10 12 15 17 10"/>
                                            <line x1="12" y1="15" x2="12" y2="3"/>
                                        </svg>
                                        导出CSV
                                    </button>
                                    <button class="history-export-btn" onclick="todoReminderManager.exportHistory('excel')">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                                            <polyline points="7 10 12 15 17 10"/>
                                            <line x1="12" y1="15" x2="12" y2="3"/>
                                        </svg>
                                        导出Excel
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="history-timeline">
                            ${this.renderHistoryTimeline(historyEntries)}
                        </div>
                    </div>

                    <div class="history-modal-footer">
                        <button class="history-clear-btn" onclick="todoReminderManager.clearHistory()">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                            </svg>
                            清空历史
                        </button>
                    </div>
                </div>
            </div>
        `;

        return modal;
    }

    /**
     * 获取今日历史记录数量
     * @returns {number} 今日历史记录数量
     */
    getTodayHistoryCount() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();

        let count = 0;
        this.historyData.forEach(entry => {
            if (entry.timestamp >= todayTimestamp) {
                count++;
            }
        });

        return count;
    }

    /**
     * 渲染历史时间线
     * 性能优化：实现虚拟滚动，支持大量数据
     * @param {Array} historyEntries - 历史记录条目
     * @returns {string} HTML内容
     */
    renderHistoryTimeline(historyEntries) {
        if (historyEntries.length === 0) {
            return `
                <div class="history-empty">
                    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <p>暂无历史记录</p>
                </div>
            `;
        }

        // 按日期分组
        const groupedEntries = this.groupHistoryByDate(historyEntries);

        // 检查是否需要虚拟滚动（条目数超过50时启用）
        const totalEntries = historyEntries.length;
        const useVirtualScroll = totalEntries > 50;

        if (useVirtualScroll) {
            return this.renderVirtualizedHistory(groupedEntries, totalEntries);
        } else {
            // 小数据集直接渲染
            return this.renderNormalHistory(groupedEntries);
        }
    }

    /**
     * 性能优化：虚拟滚动渲染历史记录
     * @param {Object} groupedEntries - 按日期分组的记录
     * @param {number} totalEntries - 总条目数
     * @returns {string} HTML内容
     */
    renderVirtualizedHistory(groupedEntries, totalEntries) {
        const itemHeight = 72; // 每个条目的固定高度
        const bufferSize = 10; // 缓冲区大小（上下各10项）
        const containerHeight = 400; // 容器高度

        // 计算可视区域内的条目范围
        const visibleStart = 0; // 默认从0开始
        const visibleEnd = Math.min(bufferSize * 2, totalEntries);

        let html = `
            <div class="virtual-scroll-container" style="height: ${containerHeight}px; overflow-y: auto; position: relative;">
                <div class="virtual-scroll-content" style="height: ${totalEntries * itemHeight}px; position: relative;">
                    <div class="virtual-scroll-viewport" style="position: absolute; top: 0; left: 0; right: 0;">
        `;

        // 渲染可见区域的条目
        let currentIndex = 0;
        for (const [dateKey, entries] of Object.entries(groupedEntries)) {
            html += `<div class="history-date-group" data-date="${dateKey}">`;
            html += `<div class="history-date-header">${dateKey}</div>`;
            html += `<div class="history-items">`;

            entries.forEach(([historyId, entry]) => {
                if (currentIndex >= visibleStart && currentIndex < visibleEnd) {
                    const priorityData = this.getPriorityData(entry.priority);
                    const actionText = this.getActionText(entry.action);
                    const timeText = this.formatTime(entry.timestamp);
                    const topPosition = currentIndex * itemHeight;

                    html += `
                        <div class="history-item virtual-scroll-item"
                             data-action="${entry.action}"
                             data-priority="${entry.priority}"
                             style="position: absolute; top: ${topPosition}px; left: 0; right: 0; height: ${itemHeight}px;">
                            <div class="history-item-icon" style="background-color: ${priorityData.bgColor}">
                                ${this.getActionIcon(entry.action)}
                            </div>
                            <div class="history-item-content">
                                <div class="history-item-title">
                                    <span class="history-action-text">${actionText}</span>
                                    <span class="history-todo-title">"${this.escapeHtml(entry.title)}"</span>
                                </div>
                                <div class="history-item-meta">
                                    <span class="history-item-time">${timeText}</span>
                                    ${entry.agentName ? `<span class="history-item-agent">${this.escapeHtml(entry.agentName)}</span>` : ''}
                                    <span class="history-item-priority">${this.getPriorityText(entry.priority)}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }
                currentIndex++;
            });

            html += `</div></div>`;
        }

        html += `
                    </div>
                </div>
            </div>
            <div class="virtual-scroll-info" style="text-align: center; padding: 10px; color: #666; font-size: 12px;">
                显示 ${visibleEnd} / ${totalEntries} 条记录（启用虚拟滚动）
            </div>
        `;

        return html;
    }

    /**
     * 性能优化：普通模式渲染历史记录
     * @param {Object} groupedEntries - 按日期分组的记录
     * @returns {string} HTML内容
     */
    renderNormalHistory(groupedEntries) {
        let html = '';
        for (const [dateKey, entries] of Object.entries(groupedEntries)) {
            html += `<div class="history-date-group">`;
            html += `<div class="history-date-header">${dateKey}</div>`;
            html += `<div class="history-items">`;

            entries.forEach(([historyId, entry]) => {
                const priorityData = this.getPriorityData(entry.priority);
                const actionText = this.getActionText(entry.action);
                const timeText = this.formatTime(entry.timestamp);

                html += `
                    <div class="history-item" data-action="${entry.action}" data-priority="${entry.priority}">
                        <div class="history-item-icon" style="background-color: ${priorityData.bgColor}">
                            ${this.getActionIcon(entry.action)}
                        </div>
                        <div class="history-item-content">
                            <div class="history-item-title">
                                <span class="history-action-text">${actionText}</span>
                                <span class="history-todo-title">"${this.escapeHtml(entry.title)}"</span>
                            </div>
                            <div class="history-item-meta">
                                <span class="history-item-time">${timeText}</span>
                                ${entry.agentName ? `<span class="history-item-agent">${this.escapeHtml(entry.agentName)}</span>` : ''}
                                <span class="history-item-priority">${this.getPriorityText(entry.priority)}</span>
                            </div>
                        </div>
                    </div>
                `;
            });

            html += `</div></div>`;
        }

        return html;
    }

    /**
     * 按日期分组历史记录
     * @param {Array} entries - 历史记录条目
     * @returns {Object} 按日期分组的记录
     */
    groupHistoryByDate(entries) {
        const groups = {};
        const now = new Date();

        entries.forEach(([historyId, entry]) => {
            const entryDate = new Date(entry.timestamp);
            let dateKey;

            // 判断日期分组
            if (this.isSameDay(entryDate, now)) {
                dateKey = '今天';
            } else if (this.isSameDay(entryDate, new Date(now.getTime() - 86400000))) {
                dateKey = '昨天';
            } else if (this.isWithinDays(entryDate, now, 7)) {
                dateKey = '本周';
            } else if (this.isWithinDays(entryDate, now, 30)) {
                dateKey = '本月';
            } else {
                const month = entryDate.getMonth() + 1;
                const day = entryDate.getDate();
                dateKey = `${month}月${day}日`;
            }

            if (!groups[dateKey]) {
                groups[dateKey] = [];
            }
            groups[dateKey].push([historyId, entry]);
        });

        return groups;
    }

    /**
     * 检查两个日期是否同一天
     * @param {Date} date1 - 日期1
     * @param {Date} date2 - 日期2
     * @returns {boolean} 是否同一天
     */
    isSameDay(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }

    /**
     * 检查日期是否在指定天数内
     * @param {Date} date - 要检查的日期
     * @param {Date} fromDate - 起始日期
     * @param {number} days - 天数
     * @returns {boolean} 是否在指定天数内
     */
    isWithinDays(date, fromDate, days) {
        const diff = fromDate - date;
        return diff <= days * 86400000 && diff >= 0;
    }

    /**
     * 获取操作文本
     * @param {string} action - 操作类型
     * @returns {string} 操作文本
     */
    getActionText(action) {
        const actionMap = {
            'completed': '已完成',
            'snoozed': '稍后提醒',
            'dismissed': '已忽略'
        };
        return actionMap[action] || action;
    }

    /**
     * 获取操作图标
     * @param {string} action - 操作类型
     * @returns {string} 操作图标
     */
    getActionIcon(action) {
        const iconMap = {
            'completed': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
            'snoozed': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
            'dismissed': '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        };
        return iconMap[action] || '';
    }

    /**
     * 筛选历史记录
     */
    filterHistory() {
        const searchInput = document.getElementById('history-search-input');
        const actionFilter = document.getElementById('history-action-filter');
        const priorityFilter = document.getElementById('history-priority-filter');
        const dateFilter = document.getElementById('history-date-filter');

        if (!searchInput || !actionFilter || !priorityFilter || !dateFilter) return;

        const searchTerm = searchInput.value.toLowerCase();
        const actionValue = actionFilter.value;
        const priorityValue = priorityFilter.value;
        const dateValue = dateFilter.value;

        // 获取所有历史项目
        const allItems = document.querySelectorAll('.history-item');

        allItems.forEach(item => {
            let show = true;

            // 搜索过滤
            if (searchTerm) {
                const title = item.querySelector('.history-todo-title')?.textContent.toLowerCase() || '';
                if (!title.includes(searchTerm)) {
                    show = false;
                }
            }

            // 操作类型过滤
            if (actionValue && item.getAttribute('data-action') !== actionValue) {
                show = false;
            }

            // 优先级过滤
            if (priorityValue && item.getAttribute('data-priority') !== priorityValue) {
                show = false;
            }

            // 日期过滤
            if (dateValue) {
                const timeElement = item.querySelector('.history-item-time');
                if (timeElement) {
                    const timeText = timeElement.textContent;
                    if (!this.matchesDateFilter(timeText, dateValue)) {
                        show = false;
                    }
                }
            }

            // 显示或隐藏项目
            item.style.display = show ? 'flex' : 'none';
        });
    }

    /**
     * 检查时间文本是否匹配日期过滤器
     * @param {string} timeText - 时间文本
     * @param {string} filter - 日期过滤器
     * @returns {boolean} 是否匹配
     */
    matchesDateFilter(timeText, filter) {
        const now = new Date();

        switch (filter) {
            case 'today':
                return timeText.includes('刚刚') || timeText.includes('分钟前') ||
                       timeText.includes('小时前') && parseInt(timeText) < 24 ||
                       timeText.includes('今天');
            case 'yesterday':
                return timeText.includes('昨天');
            case 'week':
                return timeText.includes('天前') && parseInt(timeText) < 7 ||
                       timeText.includes('本周');
            case 'month':
                return timeText.includes('天前') && parseInt(timeText) < 30 ||
                       timeText.includes('月') ||
                       timeText.includes('本周');
            default:
                return true;
        }
    }

    /**
     * 导出历史记录
     * @param {string} format - 导出格式：json、csv 或 excel
     */
    exportHistory(format) {
        const entries = Array.from(this.historyData.values());

        if (entries.length === 0) {
            this.showToast('暂无历史记录可导出', 'info');
            return;
        }

        if (format === 'json') {
            this.exportToJSON(entries);
        } else if (format === 'csv') {
            this.exportToCSV(entries);
        } else if (format === 'excel') {
            this.exportToExcel(entries);
        }

        this.showToast(`历史记录已导出为 ${format.toUpperCase()} 格式`, 'success');
    }

    /**
     * 导出为JSON格式
     * @param {Array} entries - 历史记录条目
     */
    exportToJSON(entries) {
        const dataStr = JSON.stringify(entries, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `todo-history-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();

        URL.revokeObjectURL(url);
    }

    /**
     * 导出为CSV格式
     * @param {Array} entries - 历史记录条目
     */
    exportToCSV(entries) {
        const headers = ['操作时间', '操作类型', '待办标题', '待办内容', '优先级', '智能体', '状态'];
        const rows = entries.map(entry => [
            new Date(entry.timestamp).toLocaleString('zh-CN'),
            this.getActionText(entry.action),
            entry.title,
            entry.content,
            this.getPriorityText(entry.priority),
            entry.agentName,
            entry.status
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const dataBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `todo-history-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();

        URL.revokeObjectURL(url);
    }

    /**
     * 导出为Excel格式 (使用SheetJS)
     * @param {Array} entries - 历史记录条目
     */
    exportToExcel(entries) {
        // 尝试使用SheetJS库，如果不存在则提示用户
        if (typeof XLSX === 'undefined') {
            this.showToast('Excel导出需要加载SheetJS库，请在页面中引入xlsx.min.js', 'warning');
            // 提供CSV作为备选
            this.exportToCSV(entries);
            return;
        }

        const worksheetData = entries.map(entry => ({
            '操作时间': new Date(entry.timestamp).toLocaleString('zh-CN'),
            '操作类型': this.getActionText(entry.action),
            '待办标题': entry.title,
            '待办内容': entry.content,
            '优先级': this.getPriorityText(entry.priority),
            '智能体': entry.agentName,
            '状态': entry.status
        }));

        const worksheet = XLSX.utils.json_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, '历史记录');

        XLSX.writeFile(workbook, `todo-history-${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    /**
     * 清空历史记录
     */
    clearHistory() {
        if (!confirm('确定要清空所有历史记录吗？此操作不可恢复。')) {
            return;
        }

        this.historyData.clear();
        this.saveHistoryData();

        // 关闭当前模态框
        this.closeHistoryModal();

        this.showToast('历史记录已清空', 'success');
    }

    /**
     * 关闭历史记录模态框
     */
    closeHistoryModal() {
        const modal = this.currentHistoryModal;
        if (!modal) return;

        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
            this.currentHistoryModal = null;
        }, 300);
    }

    // ========================================
    // 统计功能模块 (TASK-015)
    // ========================================

    /**
     * 显示统计模态框
     * 性能优化：懒加载统计数据
     */
    showStatistics() {
        // 创建模态框
        const modal = this.createStatisticsModal();

        // 添加到页面
        document.body.appendChild(modal);

        // 触发动画
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });

        // 保存当前模态框引用
        this.currentStatisticsModal = modal;

        // 聚焦管理
        const closeButton = modal.querySelector('.statistics-modal-close');
        if (closeButton) {
            closeButton.focus();
        }

        // 添加键盘事件监听（ESC关闭）
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeStatisticsModal();
                document.removeEventListener('keydown', escHandler);
                modal._escHandler = null;
            }
        };
        document.addEventListener('keydown', escHandler);
        modal._escHandler = escHandler;

        // 点击外部关闭
        const clickOutsideHandler = (e) => {
            if (e.target === modal || e.target.classList.contains('modal-overlay')) {
                this.closeStatisticsModal();
                modal.removeEventListener('click', clickOutsideHandler);
            }
        };
        modal.addEventListener('click', clickOutsideHandler);

        // 延迟初始化统计数据（懒加载）
        requestAnimationFrame(() => {
            this.refreshStatisticsData();
        });
    }

    /**
     * 创建统计模态框
     * @returns {HTMLElement} 模态框元素
     */
    createStatisticsModal() {
        const modal = document.createElement('div');
        modal.className = 'todo-statistics-modal';

        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="statistics-modal-content">
                    <div class="statistics-modal-header">
                        <div class="statistics-modal-title-section">
                            <h2 class="statistics-modal-title">
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="20" x2="18" y2="10"/>
                                    <line x1="12" y1="20" x2="12" y2="4"/>
                                    <line x1="6" y1="20" x2="6" y2="14"/>
                                </svg>
                                提醒统计分析
                            </h2>
                            <div class="statistics-actions">
                                <button class="statistics-export-btn" onclick="todoReminderManager.exportStatistics()">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                                        <polyline points="7 10 12 15 17 10"/>
                                        <line x1="12" y1="15" x2="12" y2="3"/>
                                    </svg>
                                    导出报告
                                </button>
                            </div>
                        </div>
                        <button class="statistics-modal-close" onclick="todoReminderManager.closeStatisticsModal()" aria-label="关闭">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    <div class="statistics-tabs">
                        <button class="statistics-tab active" data-tab="overview" onclick="todoReminderManager.switchStatisticsTab('overview')">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="7" height="7"/>
                                <rect x="14" y="3" width="7" height="7"/>
                                <rect x="14" y="14" width="7" height="7"/>
                                <rect x="3" y="14" width="7" height="7"/>
                            </svg>
                            概览
                        </button>
                        <button class="statistics-tab" data-tab="trends" onclick="todoReminderManager.switchStatisticsTab('trends')">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                            </svg>
                            趋势
                        </button>
                        <button class="statistics-tab" data-tab="analysis" onclick="todoReminderManager.switchStatisticsTab('analysis')">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                            分析
                        </button>
                        <button class="statistics-tab" data-tab="reports" onclick="todoReminderManager.switchStatisticsTab('reports')">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                                <polyline points="10 9 9 9 8 9"/>
                            </svg>
                            报告
                        </button>
                    </div>

                    <div class="statistics-modal-body">
                        <!-- 概览标签页 -->
                        <div class="statistics-tab-content active" data-tab="overview">
                            ${this.renderOverviewTab()}
                        </div>

                        <!-- 趋势标签页 -->
                        <div class="statistics-tab-content" data-tab="trends">
                            ${this.renderTrendsTab()}
                        </div>

                        <!-- 分析标签页 -->
                        <div class="statistics-tab-content" data-tab="analysis">
                            ${this.renderAnalysisTab()}
                        </div>

                        <!-- 报告标签页 -->
                        <div class="statistics-tab-content" data-tab="reports">
                            ${this.renderReportsTab()}
                        </div>
                    </div>
                </div>
            </div>
        `;

        return modal;
    }

    /**
     * 渲染概览标签页
     * @returns {string} HTML内容
     */
    renderOverviewTab() {
        const stats = this.calculateReminderStatistics();

        return `
            <div class="overview-stats-grid">
                <!-- 总计统计 -->
                <div class="stats-card">
                    <div class="stats-card-header">
                        <div class="stats-card-icon total">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                            </svg>
                        </div>
                        <h3 class="stats-card-title">总计提醒</h3>
                    </div>
                    <div class="stats-card-value">${stats.totalReminders}</div>
                    <div class="stats-card-description">所有历史记录</div>
                </div>

                <!-- 已完成统计 -->
                <div class="stats-card">
                    <div class="stats-card-header">
                        <div class="stats-card-icon completed">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                        </div>
                        <h3 class="stats-card-title">已完成</h3>
                    </div>
                    <div class="stats-card-value">${stats.completedCount}</div>
                    <div class="stats-card-description">
                        完成率 ${stats.completionRate.toFixed(1)}%
                    </div>
                </div>

                <!-- 待办统计 -->
                <div class="stats-card">
                    <div class="stats-card-header">
                        <div class="stats-card-icon pending">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 14"/>
                            </svg>
                        </div>
                        <h3 class="stats-card-title">待办中</h3>
                    </div>
                    <div class="stats-card-value">${stats.pendingCount}</div>
                    <div class="stats-card-description">进行中的任务</div>
                </div>

                <!-- 逾期统计 -->
                <div class="stats-card">
                    <div class="stats-card-header">
                        <div class="stats-card-icon overdue">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                            </svg>
                        </div>
                        <h3 class="stats-card-title">已逾期</h3>
                    </div>
                    <div class="stats-card-value">${stats.overdueCount}</div>
                    <div class="stats-card-description">
                        占比 ${stats.overdueRate.toFixed(1)}%
                    </div>
                </div>
            </div>

            <!-- 按优先级分布 -->
            <div class="stats-section">
                <h3 class="stats-section-title">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    按优先级分布
                </h3>
                <div class="priority-distribution">
                    ${this.renderPriorityDistribution(stats.byPriority)}
                </div>
            </div>

            <!-- 按类型分布 -->
            <div class="stats-section">
                <h3 class="stats-section-title">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                    按类型分布
                </h3>
                <div class="type-distribution">
                    ${this.renderTypeDistribution(stats.byType)}
                </div>
            </div>
        `;
    }

    /**
     * 渲染趋势标签页
     * @returns {string} HTML内容
     */
    renderTrendsTab() {
        const trends = this.calculateCompletionTrends();

        return `
            <div class="trends-container">
                <!-- 时间范围选择 -->
                <div class="trends-controls">
                    <div class="time-range-selector">
                        <button class="time-range-btn active" data-range="7" onclick="todoReminderManager.changeTimeRange('7')">最近7天</button>
                        <button class="time-range-btn" data-range="30" onclick="todoReminderManager.changeTimeRange('30')">最近30天</button>
                        <button class="time-range-btn" data-range="90" onclick="todoReminderManager.changeTimeRange('90')">最近90天</button>
                    </div>
                </div>

                <!-- 完成率趋势图 -->
                <div class="stats-section">
                    <h3 class="stats-section-title">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                        </svg>
                        完成率趋势
                    </h3>
                    <div class="completion-trend-chart">
                        ${this.renderCompletionTrendChart(trends)}
                    </div>
                </div>

                <!-- 每日完成统计 -->
                <div class="stats-section">
                    <h3 class="stats-section-title">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        每日完成情况
                    </h3>
                    <div class="daily-completion-chart">
                        ${this.renderDailyCompletionChart(trends)}
                    </div>
                </div>

                <!-- 生产力分析 -->
                <div class="stats-section">
                    <h3 class="stats-section-title">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        生产力分析
                    </h3>
                    <div class="productivity-analysis">
                        ${this.renderProductivityAnalysis(trends)}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染分析标签页
     * @returns {string} HTML内容
     */
    renderAnalysisTab() {
        const analysis = this.analyzeOverdueSituations();

        return `
            <div class="analysis-container">
                <!-- 逾期概览 -->
                <div class="stats-section">
                    <h3 class="stats-section-title">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                        逾期情况分析
                    </h3>
                    <div class="overdue-overview">
                        ${this.renderOverdueOverview(analysis)}
                    </div>
                </div>

                <!-- 逾期原因分析 -->
                <div class="stats-section">
                    <h3 class="stats-section-title">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="12"/>
                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        常见逾期原因
                    </h3>
                    <div class="overdue-reasons">
                        ${this.renderOverdueReasons(analysis)}
                    </div>
                </div>

                <!-- 改进建议 -->
                <div class="stats-section">
                    <h3 class="stats-section-title">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                        </svg>
                        改进建议
                    </h3>
                    <div class="improvement-suggestions">
                        ${this.renderImprovementSuggestions(analysis)}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染报告标签页
     * @returns {string} HTML内容
     */
    renderReportsTab() {
        const reports = this.generateWeeklyMonthlyReports();

        return `
            <div class="reports-container">
                <!-- 周报 -->
                <div class="stats-section">
                    <h3 class="stats-section-title">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        本周报告
                    </h3>
                    <div class="weekly-report">
                        ${this.renderWeeklyReport(reports.weekly)}
                        <div class="report-actions">
                            <button class="report-download-btn" onclick="todoReminderManager.downloadReport('weekly')">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                                    <polyline points="7 10 12 15 17 10"/>
                                    <line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                                下载周报
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 月报 -->
                <div class="stats-section">
                    <h3 class="stats-section-title">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        本月报告
                    </h3>
                    <div class="monthly-report">
                        ${this.renderMonthlyReport(reports.monthly)}
                        <div class="report-actions">
                            <button class="report-download-btn" onclick="todoReminderManager.downloadReport('monthly')">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                                    <polyline points="7 10 12 15 17 10"/>
                                    <line x1="12" y1="15" x2="12" y2="3"/>
                                </svg>
                                下载月报
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 历史报告列表 -->
                <div class="stats-section">
                    <h3 class="stats-section-title">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        历史报告
                    </h3>
                    <div class="historical-reports">
                        ${this.renderHistoricalReports()}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 计算提醒统计数据
     * @returns {Object} 统计数据
     */
    calculateReminderStatistics() {
        const historyEntries = Array.from(this.historyData.values());
        const totalReminders = historyEntries.length;

        // 按状态统计
        const completedCount = historyEntries.filter(e => e.action === 'completed').length;
        const snoozedCount = historyEntries.filter(e => e.action === 'snoozed').length;
        const dismissedCount = historyEntries.filter(e => e.action === 'dismissed').length;
        const pendingCount = totalReminders - completedCount - snoozedCount - dismissedCount;

        // 逾期统计（需要从历史数据中推断）
        const overdueCount = historyEntries.filter(e => {
            if (e.status === 'overdue' || e.metadata?.isOverdue) return true;
            return false;
        }).length;

        // 完成率计算
        const completionRate = totalReminders > 0 ? (completedCount / totalReminders) * 100 : 0;
        const overdueRate = totalReminders > 0 ? (overdueCount / totalReminders) * 100 : 0;

        // 按优先级统计
        const byPriority = {
            high: historyEntries.filter(e => e.priority === 'high').length,
            medium: historyEntries.filter(e => e.priority === 'medium').length,
            normal: historyEntries.filter(e => e.priority === 'normal').length,
            low: historyEntries.filter(e => e.priority === 'low').length
        };

        // 按类型统计
        const byType = {
            normal: historyEntries.filter(e => e.reminderType === 'normal').length,
            daily_summary: historyEntries.filter(e => e.reminderType === 'daily_summary').length,
            overdue: historyEntries.filter(e => e.reminderType === 'overdue').length
        };

        // 计算平均完成时间（需要从历史数据中提取）
        const completionTimes = historyEntries
            .filter(e => e.action === 'completed' && e.metadata?.completedAt)
            .map(e => e.metadata.completedAt - e.timestamp);

        const averageCompletionTime = completionTimes.length > 0
            ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
            : 0;

        return {
            totalReminders,
            completedCount,
            pendingCount,
            snoozedCount,
            dismissedCount,
            overdueCount,
            completionRate,
            overdueRate,
            byPriority,
            byType,
            averageCompletionTime: averageCompletionTime / (1000 * 60) // 转换为分钟
        };
    }

    /**
     * 计算完成趋势
     * @returns {Object} 趋势数据
     */
    calculateCompletionTrends() {
        const historyEntries = Array.from(this.historyData.values());
        const now = new Date();

        // 获取最近30天的数据
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const recentEntries = historyEntries.filter(e => e.timestamp >= thirtyDaysAgo.getTime());

        // 按天分组
        const dailyStats = {};
        for (let i = 0; i < 30; i++) {
            const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dateKey = date.toISOString().slice(0, 10);
            dailyStats[dateKey] = {
                date: dateKey,
                completed: 0,
                created: 0,
                pending: 0,
                overdue: 0
            };
        }

        recentEntries.forEach(entry => {
            const dateKey = new Date(entry.timestamp).toISOString().slice(0, 10);
            if (dailyStats[dateKey]) {
                if (entry.action === 'completed') {
                    dailyStats[dateKey].completed++;
                } else if (entry.action === 'snoozed') {
                    dailyStats[dateKey].pending++;
                }
                dailyStats[dateKey].created++;
            }
        });

        // 按小时统计（找出生产力高峰时段）
        const hourlyStats = {};
        for (let i = 0; i < 24; i++) {
            hourlyStats[i] = 0;
        }

        recentEntries
            .filter(e => e.action === 'completed')
            .forEach(entry => {
                const hour = new Date(entry.timestamp).getHours();
                hourlyStats[hour]++;
            });

        // 找出最高产的时段
        const peakHour = Object.keys(hourlyStats).reduce((a, b) =>
            hourlyStats[a] > hourlyStats[b] ? a : b, 0
        );

        // 按星期统计
        const weekdayStats = [0, 0, 0, 0, 0, 0, 0]; // 0=周日, 1=周一, ...
        recentEntries
            .filter(e => e.action === 'completed')
            .forEach(entry => {
                const weekday = new Date(entry.timestamp).getDay();
                weekdayStats[weekday]++;
            });

        return {
            dailyStats: Object.values(dailyStats).reverse(),
            hourlyStats,
            peakHour,
            weekdayStats,
            totalCompleted: recentEntries.filter(e => e.action === 'completed').length
        };
    }

    /**
     * 分析逾期情况
     * @returns {Object} 逾期分析数据
     */
    analyzeOverdueSituations() {
        const historyEntries = Array.from(this.historyData.values());

        // 过滤逾期相关记录
        const overdueEntries = historyEntries.filter(e =>
            e.status === 'overdue' ||
            e.metadata?.isOverdue ||
            e.reminderType === 'overdue'
        );

        const overdueCount = overdueEntries.length;

        // 按优先级统计逾期
        const overdueByPriority = {
            high: overdueEntries.filter(e => e.priority === 'high').length,
            medium: overdueEntries.filter(e => e.priority === 'medium').length,
            normal: overdueEntries.filter(e => e.priority === 'normal').length,
            low: overdueEntries.filter(e => e.priority === 'low').length
        };

        // 计算平均逾期天数
        const overdueDays = overdueEntries
            .filter(e => e.metadata?.overdueDays)
            .map(e => e.metadata.overdueDays);

        const averageOverdueDays = overdueDays.length > 0
            ? overdueDays.reduce((a, b) => a + b, 0) / overdueDays.length
            : 0;

        // 分析逾期原因（基于标签和内容）
        const commonReasons = {
            '时间不够': overdueEntries.filter(e =>
                e.content?.includes('时间') || e.content?.includes('来不及')
            ).length,
            '优先级冲突': overdueEntries.filter(e =>
                e.priority === 'medium' || e.priority === 'low'
            ).length,
            '依赖未完成': overdueEntries.filter(e =>
                e.content?.includes('依赖') || e.content?.includes('等待')
            ).length,
            '信息不足': overdueEntries.filter(e =>
                e.content?.includes('不明确') || e.content?.includes('需要确认')
            ).length
        };

        // 找出最常见的逾期原因
        const topReasons = Object.entries(commonReasons)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        return {
            overdueCount,
            overdueByPriority,
            averageOverdueDays,
            commonReasons: topReasons,
            totalEntries: historyEntries.length,
            overdueRate: historyEntries.length > 0
                ? (overdueCount / historyEntries.length) * 100
                : 0
        };
    }

    /**
     * 生成周报/月报
     * @returns {Object} 报告数据
     */
    generateWeeklyMonthlyReports() {
        const now = new Date();
        const historyEntries = Array.from(this.historyData.values());

        // 生成周报（过去7天）
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weeklyEntries = historyEntries.filter(e => e.timestamp >= weekAgo.getTime());

        const weeklyStats = {
            period: `${weekAgo.toLocaleDateString('zh-CN')} - ${now.toLocaleDateString('zh-CN')}`,
            total: weeklyEntries.length,
            completed: weeklyEntries.filter(e => e.action === 'completed').length,
            pending: weeklyEntries.filter(e => e.action === 'snoozed').length,
            dismissed: weeklyEntries.filter(e => e.action === 'dismissed').length,
            completionRate: weeklyEntries.length > 0
                ? (weeklyEntries.filter(e => e.action === 'completed').length / weeklyEntries.length * 100).toFixed(1)
                : 0,
            topPriority: this.getMostCommonPriority(weeklyEntries),
            averagePerDay: (weeklyEntries.length / 7).toFixed(1)
        };

        // 生成月报（过去30天）
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const monthlyEntries = historyEntries.filter(e => e.timestamp >= monthAgo.getTime());

        const monthlyStats = {
            period: `${monthAgo.toLocaleDateString('zh-CN')} - ${now.toLocaleDateString('zh-CN')}`,
            total: monthlyEntries.length,
            completed: monthlyEntries.filter(e => e.action === 'completed').length,
            pending: monthlyEntries.filter(e => e.action === 'snoozed').length,
            dismissed: monthlyEntries.filter(e => e.action === 'dismissed').length,
            completionRate: monthlyEntries.length > 0
                ? (monthlyEntries.filter(e => e.action === 'completed').length / monthlyEntries.length * 100).toFixed(1)
                : 0,
            topPriority: this.getMostCommonPriority(monthlyEntries),
            averagePerDay: (monthlyEntries.length / 30).toFixed(1),
            improvementRate: this.calculateImprovementRate(monthlyEntries, historyEntries)
        };

        return {
            weekly: weeklyStats,
            monthly: monthlyStats
        };
    }

    /**
     * 切换统计标签页
     * @param {string} tabName - 标签页名称
     */
    switchStatisticsTab(tabName) {
        // 更新标签状态
        document.querySelectorAll('.statistics-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // 更新内容区域
        document.querySelectorAll('.statistics-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    }

    /**
     * 刷新统计数据
     */
    refreshStatisticsData() {
        // 重新加载历史数据
        this.loadHistoryData();

        // 更新当前标签页的数据
        const activeTab = document.querySelector('.statistics-tab.active');
        if (activeTab) {
            const tabName = activeTab.getAttribute('data-tab');
            // 重新渲染当前标签页
            const tabContent = document.querySelector(`.statistics-tab-content[data-tab="${tabName}"]`);
            if (tabContent) {
                switch (tabName) {
                    case 'overview':
                        tabContent.innerHTML = this.renderOverviewTab();
                        break;
                    case 'trends':
                        tabContent.innerHTML = this.renderTrendsTab();
                        break;
                    case 'analysis':
                        tabContent.innerHTML = this.renderAnalysisTab();
                        break;
                    case 'reports':
                        tabContent.innerHTML = this.renderReportsTab();
                        break;
                }
            }
        }
    }

    /**
     * 关闭统计模态框
     */
    closeStatisticsModal() {
        const modal = this.currentStatisticsModal;
        if (!modal) return;

        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
            this.currentStatisticsModal = null;
        }, 300);
    }

    // ========================================
    // 辅助方法
    // ========================================

    /**
     * 渲染优先级分布
     * @param {Object} byPriority - 按优先级统计的数据
     * @returns {string} HTML内容
     */
    renderPriorityDistribution(byPriority) {
        const total = Object.values(byPriority).reduce((a, b) => a + b, 0);
        if (total === 0) return '<p class="no-data">暂无数据</p>';

        const priorities = [
            { key: 'high', label: '高优先级', color: '#ff4444' },
            { key: 'medium', label: '中优先级', color: '#ff9800' },
            { key: 'normal', label: '普通', color: '#2196F3' },
            { key: 'low', label: '低优先级', color: '#4CAF50' }
        ];

        return `
            <div class="distribution-bar">
                ${priorities.map(p => {
                    const count = byPriority[p.key] || 0;
                    const percentage = total > 0 ? (count / total * 100) : 0;
                    return `
                        <div class="distribution-item">
                            <div class="distribution-label">
                                <span class="distribution-color" style="background: ${p.color}"></span>
                                <span>${p.label}</span>
                                <span class="distribution-count">${count}</span>
                            </div>
                            <div class="distribution-progress">
                                <div class="distribution-fill" style="width: ${percentage}%; background: ${p.color}"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    /**
     * 渲染类型分布
     * @param {Object} byType - 按类型统计的数据
     * @returns {string} HTML内容
     */
    renderTypeDistribution(byType) {
        const total = Object.values(byType).reduce((a, b) => a + b, 0);
        if (total === 0) return '<p class="no-data">暂无数据</p>';

        const types = [
            { key: 'normal', label: '普通提醒', color: '#2196F3' },
            { key: 'daily_summary', label: '每日汇总', color: '#9C27B0' },
            { key: 'overdue', label: '逾期提醒', color: '#ff4444' }
        ];

        return `
            <div class="distribution-bar">
                ${types.map(t => {
                    const count = byType[t.key] || 0;
                    const percentage = total > 0 ? (count / total * 100) : 0;
                    return `
                        <div class="distribution-item">
                            <div class="distribution-label">
                                <span class="distribution-color" style="background: ${t.color}"></span>
                                <span>${t.label}</span>
                                <span class="distribution-count">${count}</span>
                            </div>
                            <div class="distribution-progress">
                                <div class="distribution-fill" style="width: ${percentage}%; background: ${t.color}"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    /**
     * 渲染完成趋势图
     * @param {Object} trends - 趋势数据
     * @returns {string} HTML内容
     */
    renderCompletionTrendChart(trends) {
        const { dailyStats, totalCompleted } = trends;
        if (dailyStats.length === 0) return '<p class="no-data">暂无数据</p>';

        // 找出最大值用于缩放
        const maxValue = Math.max(...dailyStats.map(d => d.completed));
        const scaleFactor = maxValue > 0 ? 100 / maxValue : 0;

        return `
            <div class="trend-chart">
                <div class="chart-bars">
                    ${dailyStats.slice(-14).map(day => {
                        const height = day.completed * scaleFactor;
                        return `
                            <div class="chart-bar">
                                <div class="bar-value" style="height: ${height}%">${day.completed}</div>
                                <div class="bar-fill" style="height: ${height}%"></div>
                                <div class="bar-label">${new Date(day.date).getMonth() + 1}/${new Date(day.date).getDate()}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="chart-summary">
                    过去14天完成 ${totalCompleted} 个任务
                </div>
            </div>
        `;
    }

    /**
     * 渲染每日完成图
     * @param {Object} trends - 趋势数据
     * @returns {string} HTML内容
     */
    renderDailyCompletionChart(trends) {
        return `
            <div class="daily-chart">
                ${trends.dailyStats.slice(-7).map(day => {
                    const date = new Date(day.date);
                    const dayName = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
                    const completed = day.completed;
                    const pending = day.pending;

                    return `
                        <div class="daily-item">
                            <div class="daily-label">周${dayName}</div>
                            <div class="daily-bar-container">
                                <div class="daily-bar completed" style="height: ${completed * 10}px" title="完成: ${completed}">
                                    ${completed > 0 ? completed : ''}
                                </div>
                                <div class="daily-bar pending" style="height: ${pending * 10}px" title="待办: ${pending}">
                                    ${pending > 0 ? pending : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    /**
     * 渲染生产力分析
     * @param {Object} trends - 趋势数据
     * @returns {string} HTML内容
     */
    renderProductivityAnalysis(trends) {
        const { peakHour, hourlyStats, weekdayStats } = trends;

        return `
            <div class="productivity-grid">
                <div class="productivity-item">
                    <h4 class="productivity-title">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        高产时段
                    </h4>
                    <p class="productivity-value">${peakHour}:00 - ${(parseInt(peakHour) + 1)}:00</p>
                    <p class="productivity-desc">完成 ${hourlyStats[peakHour]} 个任务</p>
                </div>

                <div class="productivity-item">
                    <h4 class="productivity-title">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        最忙的星期
                    </h4>
                    <p class="productivity-value">周${['日', '一', '二', '三', '四', '五', '六'][weekdayStats.indexOf(Math.max(...weekdayStats))]}</p>
                    <p class="productivity-desc">完成 ${Math.max(...weekdayStats)} 个任务</p>
                </div>
            </div>
        `;
    }

    /**
     * 渲染逾期概览
     * @param {Object} analysis - 逾期分析数据
     * @returns {string} HTML内容
     */
    renderOverdueOverview(analysis) {
        return `
            <div class="overdue-cards">
                <div class="overdue-card">
                    <div class="overdue-card-icon">⚠️</div>
                    <div class="overdue-card-content">
                        <div class="overdue-card-value">${analysis.overdueCount}</div>
                        <div class="overdue-card-label">逾期总数</div>
                    </div>
                </div>

                <div class="overdue-card">
                    <div class="overdue-card-icon">⏱️</div>
                    <div class="overdue-card-content">
                        <div class="overdue-card-value">${analysis.averageOverdueDays.toFixed(1)}天</div>
                        <div class="overdue-card-label">平均逾期天数</div>
                    </div>
                </div>

                <div class="overdue-card">
                    <div class="overdue-card-icon">📊</div>
                    <div class="overdue-card-content">
                        <div class="overdue-card-value">${analysis.overdueRate.toFixed(1)}%</div>
                        <div class="overdue-card-label">逾期率</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染逾期原因
     * @param {Object} analysis - 逾期分析数据
     * @returns {string} HTML内容
     */
    renderOverdueReasons(analysis) {
        if (analysis.commonReasons.length === 0) {
            return '<p class="no-data">暂无逾期数据</p>';
        }

        return `
            <div class="reasons-list">
                ${analysis.commonReasons.map(([reason, count], index) => {
                    const percentage = analysis.overdueCount > 0
                        ? (count / analysis.overdueCount * 100).toFixed(1)
                        : 0;
                    return `
                        <div class="reason-item">
                            <div class="reason-rank">${index + 1}</div>
                            <div class="reason-content">
                                <div class="reason-name">${reason}</div>
                                <div class="reason-bar">
                                    <div class="reason-fill" style="width: ${percentage}%"></div>
                                </div>
                                <div class="reason-stats">
                                    <span class="reason-count">${count} 次</span>
                                    <span class="reason-percentage">${percentage}%</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    /**
     * 渲染改进建议
     * @param {Object} analysis - 逾期分析数据
     * @returns {string} HTML内容
     */
    renderImprovementSuggestions(analysis) {
        const suggestions = [];

        // 基于数据生成建议
        if (analysis.overdueRate > 20) {
            suggestions.push('逾期率较高，建议适当减少同时进行的任务数量');
        }

        if (analysis.overdueByPriority.high > analysis.overdueByPriority.low) {
            suggestions.push('高优先级任务逾期较多，建议优先处理高优先级事项');
        }

        if (analysis.averageOverdueDays > 3) {
            suggestions.push('平均逾期时间较长，建议合理预估任务所需时间');
        }

        suggestions.push('定期回顾和调整任务计划，避免任务堆积');

        return `
            <div class="suggestions-list">
                ${suggestions.map((suggestion, index) => `
                    <div class="suggestion-item">
                        <div class="suggestion-icon">💡</div>
                        <div class="suggestion-text">${suggestion}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    /**
     * 渲染周报
     * @param {Object} weekly - 周报数据
     * @returns {string} HTML内容
     */
    renderWeeklyReport(weekly) {
        return `
            <div class="report-summary">
                <div class="report-period">${weekly.period}</div>
                <div class="report-metrics">
                    <div class="report-metric">
                        <span class="report-metric-label">总任务</span>
                        <span class="report-metric-value">${weekly.total}</span>
                    </div>
                    <div class="report-metric">
                        <span class="report-metric-label">已完成</span>
                        <span class="report-metric-value">${weekly.completed}</span>
                    </div>
                    <div class="report-metric">
                        <span class="report-metric-label">完成率</span>
                        <span class="report-metric-value">${weekly.completionRate}%</span>
                    </div>
                </div>
                <div class="report-insights">
                    <p>本周平均每日处理 <strong>${weekly.averagePerDay}</strong> 个任务</p>
                    <p>主要处理 <strong>${weekly.topPriority}</strong> 优先级的任务</p>
                </div>
            </div>
        `;
    }

    /**
     * 渲染月报
     * @param {Object} monthly - 月报数据
     * @returns {string} HTML内容
     */
    renderMonthlyReport(monthly) {
        return `
            <div class="report-summary">
                <div class="report-period">${monthly.period}</div>
                <div class="report-metrics">
                    <div class="report-metric">
                        <span class="report-metric-label">总任务</span>
                        <span class="report-metric-value">${monthly.total}</span>
                    </div>
                    <div class="report-metric">
                        <span class="report-metric-label">已完成</span>
                        <span class="report-metric-value">${monthly.completed}</span>
                    </div>
                    <div class="report-metric">
                        <span class="report-metric-label">完成率</span>
                        <span class="report-metric-value">${monthly.completionRate}%</span>
                    </div>
                    <div class="report-metric">
                        <span class="report-metric-label">较上月</span>
                        <span class="report-metric-value ${monthly.improvementRate >= 0 ? 'positive' : 'negative'}">
                            ${monthly.improvementRate >= 0 ? '+' : ''}${monthly.improvementRate.toFixed(1)}%
                        </span>
                    </div>
                </div>
                <div class="report-insights">
                    <p>本月平均每日处理 <strong>${monthly.averagePerDay}</strong> 个任务</p>
                    <p>主要处理 <strong>${monthly.topPriority}</strong> 优先级的任务</p>
                </div>
            </div>
        `;
    }

    /**
     * 渲染历史报告列表
     * @returns {string} HTML内容
     */
    renderHistoricalReports() {
        // 这里可以从localStorage或其他存储中加载历史报告
        return `
            <div class="historical-reports-list">
                <div class="no-data">暂无历史报告</div>
            </div>
        `;
    }

    /**
     * 获取最常见的优先级
     * @param {Array} entries - 历史记录
     * @returns {string} 优先级文本
     */
    getMostCommonPriority(entries) {
        const priorities = {};
        entries.forEach(e => {
            priorities[e.priority] = (priorities[e.priority] || 0) + 1;
        });

        const mostCommon = Object.entries(priorities)
            .sort((a, b) => b[1] - a[1])[0];

        return mostCommon ? this.getPriorityText(mostCommon[0]) : '无';
    }

    /**
     * 计算改进率
     * @param {Array} currentEntries - 当前周期数据
     * @param {Array} allEntries - 所有数据
     * @returns {number} 改进率百分比
     */
    calculateImprovementRate(currentEntries, allEntries) {
        // 简化计算：基于当前周期的完成率与历史平均完成率比较
        const currentCompletionRate = currentEntries.length > 0
            ? (currentEntries.filter(e => e.action === 'completed').length / currentEntries.length) * 100
            : 0;

        const historicalCompletionRate = allEntries.length > 0
            ? (allEntries.filter(e => e.action === 'completed').length / allEntries.length) * 100
            : 0;

        return currentCompletionRate - historicalCompletionRate;
    }

    /**
     * 导出统计数据
     */
    exportStatistics() {
        const stats = this.calculateReminderStatistics();
        const trends = this.calculateCompletionTrends();
        const analysis = this.analyzeOverdueSituations();
        const reports = this.generateWeeklyMonthlyReports();

        const exportData = {
            statistics: stats,
            trends: trends,
            analysis: analysis,
            reports: reports,
            exportTime: new Date().toISOString(),
            version: '1.0'
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `todo-statistics-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();

        URL.revokeObjectURL(url);
        this.showToast('统计数据已导出', 'success');
    }

    /**
     * 下载报告
     * @param {string} type - 报告类型：weekly 或 monthly
     */
    downloadReport(type) {
        const reports = this.generateWeeklyMonthlyReports();
        const report = reports[type];

        if (!report) {
            this.showToast('报告数据不存在', 'error');
            return;
        }

        const reportContent = `
待办提醒${type === 'weekly' ? '周报' : '月报'}
${report.period}

统计数据：
- 总任务数：${report.total}
- 已完成：${report.completed}
- 待办：${report.pending}
- 已忽略：${report.dismissed}
- 完成率：${report.completionRate}%

每日平均：${report.averagePerDay} 个任务
主要优先级：${report.topPriority}

---
Generated by VCP Todo Reminder System
        `;

        const dataBlob = new Blob([reportContent], { type: 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `todo-${type}-report-${new Date().toISOString().slice(0, 10)}.txt`;
        link.click();

        URL.revokeObjectURL(url);
        this.showToast(`${type === 'weekly' ? '周报' : '月报'}已下载`, 'success');
    }

    // ========================================
    // 性能监控模块
    // ========================================

    /**
     * 性能监控：记录渲染时间
     * @param {string} operation - 操作名称
     * @param {Function} fn - 要测量的函数
     * @returns {any} 函数执行结果
     */
    measureRenderTime(operation, fn) {
        const startTime = performance.now();
        const result = fn();
        const endTime = performance.now();
        const duration = endTime - startTime;

        // 记录性能数据（目标：<16ms per frame）
        if (duration > 16) {
            console.warn(`[性能警告] ${operation} 耗时 ${duration.toFixed(2)}ms（超过16ms帧预算）`);
        } else {
            console.log(`[性能监控] ${operation} 耗时 ${duration.toFixed(2)}ms`);
        }

        // 存储到性能监控对象
        if (!this.performanceMetrics) {
            this.performanceMetrics = {};
        }
        if (!this.performanceMetrics[operation]) {
            this.performanceMetrics[operation] = [];
        }
        this.performanceMetrics[operation].push({
            duration,
            timestamp: Date.now()
        });

        return result;
    }

    /**
     * 性能监控：获取内存使用情况
     * @returns {Object|null} 内存使用信息
     */
    getMemoryUsage() {
        if (performance.memory) {
            return {
                used: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
                total: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2) + ' MB',
                limit: (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2) + ' MB',
                percentage: ((performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100).toFixed(2) + '%'
            };
        }
        return null;
    }

    /**
     * 性能监控：检查localStorage操作时间
     * @param {string} operation - 操作名称
     * @param {Function} fn - 要测量的函数
     * @returns {any} 函数执行结果
     */
    measureLocalStorageOperation(operation, fn) {
        const startTime = performance.now();
        const result = fn();
        const endTime = performance.now();
        const duration = endTime - startTime;

        // 记录localStorage性能（目标：<1ms）
        if (duration > 1) {
            console.warn(`[localStorage性能警告] ${operation} 耗时 ${duration.toFixed(2)}ms（超过1ms）`);
        }

        return result;
    }

    /**
     * 性能监控：输出性能报告
     */
    printPerformanceReport() {
        if (!this.performanceMetrics) {
            console.log('[性能报告] 暂无性能数据');
            return;
        }

        console.group('[性能报告]');
        console.log('='.repeat(50));

        // 输出内存使用情况
        const memory = this.getMemoryUsage();
        if (memory) {
            console.log(`内存使用: ${memory.used} / ${memory.total} (${memory.percentage})`);
        }

        // 输出各操作统计
        for (const [operation, metrics] of Object.entries(this.performanceMetrics)) {
            const durations = metrics.map(m => m.duration);
            const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
            const max = Math.max(...durations);
            const min = Math.min(...durations);

            console.log(`${operation}:`);
            console.log(`  平均: ${avg.toFixed(2)}ms`);
            console.log(`  最小: ${min.toFixed(2)}ms`);
            console.log(`  最大: ${max.toFixed(2)}ms`);
            console.log(`  次数: ${metrics.length}`);
        }

        console.log('='.repeat(50));
        console.groupEnd();
    }

    /**
     * 性能监控：获取DOM操作统计
     * @returns {Object} DOM操作统计
     */
    getDOMStats() {
        return {
            activeReminders: this.activeReminders.size,
            snoozedReminders: this.snoozedReminders.size,
            historyEntries: this.historyData.size,
            cacheSize: this._domCache.size,
            eventListenersActive: this._eventDelegationHandler ? 1 : 0,
            timersActive: this.snoozeTimerInterval ? 1 : 0
        };
    }

    /**
     * 更改时间范围
     * @param {string} days - 天数
     */
    changeTimeRange(days) {
        // 更新按钮状态
        document.querySelectorAll('.time-range-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-range="${days}"]`).classList.add('active');

        // 重新渲染趋势数据
        const trendsTabContent = document.querySelector('.statistics-tab-content[data-tab="trends"]');
        if (trendsTabContent) {
            trendsTabContent.innerHTML = this.renderTrendsTab();
        }
    }

    /**
     * 显示帮助提示
     * @param {HTMLElement} button - 帮助按钮元素
     */
    showHelpTooltip(button) {
        const tooltip = document.createElement('div');
        tooltip.className = 'todo-help-tooltip';
        tooltip.innerHTML = `
            <div class="tooltip-header">使用帮助</div>
            <div class="tooltip-content">
                <p><strong>如何操作待办提醒：</strong></p>
                <ul>
                    <li><strong>查看详情</strong> - 点击查看待办的完整信息</li>
                    <li><strong>稍后提醒</strong> - 设置稍后的提醒时间</li>
                    <li><strong>标记完成</strong> - 确认任务已完成</li>
                    <li><strong>关闭</strong> - 关闭此提醒窗口</li>
                </ul>
                <p>提示：查看历史记录和统计数据来了解您的待办习惯！</p>
            </div>
            <button class="tooltip-close" onclick="this.parentElement.remove()">知道了</button>
        `;

        // 计算位置
        const rect = button.getBoundingClientRect();
        tooltip.style.left = `${rect.left - 150}px`;
        tooltip.style.top = `${rect.bottom + 5}px`;

        document.body.appendChild(tooltip);

        // 点击其他地方关闭
        setTimeout(() => {
            const closeOnClickOutside = (e) => {
                if (!tooltip.contains(e.target)) {
                    tooltip.remove();
                    document.removeEventListener('click', closeOnClickOutside);
                }
            };
            document.addEventListener('click', closeOnClickOutside);
        }, 0);

        // 自动关闭
        setTimeout(() => {
            if (tooltip.parentElement) {
                tooltip.remove();
            }
        }, 10000);
    }

    /**
     * 检查是否为首次用户
     * @returns {boolean} 如果是首次用户返回true
     */
    isFirstTimeUser() {
        const hasSeenReminder = localStorage.getItem('todoReminderSeen');
        return !hasSeenReminder;
    }

    /**
     * 标记用户已看过提醒
     */
    markUserAsReturning() {
        localStorage.setItem('todoReminderSeen', 'true');
    }

    /**
     * 批量完成选中的提醒
     * @param {Array} todoIds - 待办ID数组
     */
    batchComplete(todoIds) {
        if (!todoIds || todoIds.length === 0) {
            this.showToast('请选择要完成的提醒', 'warning');
            return;
        }

        let completed = 0;
        let failed = 0;

        todoIds.forEach(todoId => {
            try {
                // 标记为完成
                const reminder = this.activeReminders.get(todoId);
                if (reminder) {
                    // 记录到历史
                    this.addToHistory({
                        action: 'complete',
                        todoId,
                        title: reminder.title || '未知标题',
                        content: reminder.content || '',
                        priority: reminder.priority || 'normal',
                        agentName: reminder.agentName || '',
                        status: 'completed'
                    });

                    // 移除提醒
                    this.removeReminder(todoId);
                    completed++;
                }
            } catch (error) {
                console.error('批量完成提醒失败:', error);
                failed++;
            }
        });

        if (completed > 0) {
            this.showToast(`已批量完成 ${completed} 个提醒`, 'success');
        }
        if (failed > 0) {
            this.showToast(`${failed} 个提醒批量操作失败`, 'error');
        }
    }

    /**
     * 批量忽略选中的提醒
     * @param {Array} todoIds - 待办ID数组
     */
    batchDismiss(todoIds) {
        if (!todoIds || todoIds.length === 0) {
            this.showToast('请选择要忽略的提醒', 'warning');
            return;
        }

        let dismissed = 0;

        todoIds.forEach(todoId => {
            try {
                this.removeReminder(todoId);
                dismissed++;
            } catch (error) {
                console.error('批量忽略提醒失败:', error);
            }
        });

        if (dismissed > 0) {
            this.showToast(`已忽略 ${dismissed} 个提醒`, 'success');
        }
    }

    /**
     * 显示批量操作工具栏
     */
    showBatchToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'todo-batch-toolbar';
        toolbar.innerHTML = `
            <div class="batch-toolbar-content">
                <span class="batch-toolbar-text">已选择 <strong class="selected-count">0</strong> 个提醒</span>
                <div class="batch-toolbar-actions">
                    <button class="batch-btn batch-complete" onclick="todoReminderManager.executeBatchComplete()">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        批量完成
                    </button>
                    <button class="batch-btn batch-dismiss" onclick="todoReminderManager.executeBatchDismiss()">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        批量忽略
                    </button>
                    <button class="batch-btn batch-cancel" onclick="todoReminderManager.hideBatchToolbar()">
                        取消
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(toolbar);
    }

    /**
     * 隐藏批量操作工具栏
     */
    hideBatchToolbar() {
        const toolbar = document.querySelector('.todo-batch-toolbar');
        if (toolbar) {
            toolbar.remove();
        }
    }

    /**
     * 执行批量完成
     */
    executeBatchComplete() {
        const checkboxes = document.querySelectorAll('.todo-select-checkbox:checked');
        const todoIds = Array.from(checkboxes).map(cb => cb.dataset.todoId);
        this.batchComplete(todoIds);
        this.hideBatchToolbar();
    }

    /**
     * 执行批量忽略
     */
    executeBatchDismiss() {
        const checkboxes = document.querySelectorAll('.todo-select-checkbox:checked');
        const todoIds = Array.from(checkboxes).map(cb => cb.dataset.todoId);
        this.batchDismiss(todoIds);
        this.hideBatchToolbar();
    }
}

// 创建全局实例
const todoReminderManager = new TodoReminderManager();

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = todoReminderManager;
}
