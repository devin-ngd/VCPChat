/**
 * 待办提醒管理器
 * 处理来自后端的 TODO_REMINDER 类型消息，以弹窗形式显示
 */

class TodoReminderManager {
    constructor() {
        this.container = null;
        this.audioContext = null;
        this.activeReminders = new Map(); // 存储当前活跃的提醒
        this.init();
    }

    init() {
        // 获取弹窗容器
        this.container = document.getElementById('todoReminderContainer');
        if (!this.container) {
            console.error('待办提醒容器未找到');
            return;
        }

        // 初始化音频上下文（用于播放提示音）
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('无法初始化音频上下文:', e);
        }
    }

    /**
     * 处理待办提醒消息
     * @param {Object} data - 提醒数据
     */
    handleTodoReminder(data) {
        if (!data || data.type !== 'TODO_REMINDER') {
            return;
        }

        // 根据提醒类型分别处理
        switch (data.reminderType) {
            case 'daily_summary':
                this.showDailySummary(data);
                break;
            case 'overdue':
                this.showOverdueAlert(data);
                break;
            case 'normal':
                this.showNormalReminder(data);
                break;
            default:
                console.warn('未知的提醒类型:', data.reminderType);
        }

        // 根据优先级播放不同音效
        this.playSound(data.priority || 'normal');
    }

    /**
     * 显示普通提醒
     */
    showNormalReminder(data) {
        const reminder = this.createReminderElement({
            type: 'normal',
            priority: data.priority || 'normal',
            title: data.title || '待办提醒',
            content: data.content || data.message,
            time: data.scheduledTime || data.timestamp,
            tags: data.tags || [],
            agentName: data.agentName,
            todoId: data.todoId
        });

        this.displayReminder(reminder, data);
    }

    /**
     * 显示逾期提醒
     */
    showOverdueAlert(data) {
        const overdueItems = data.items || [data];

        const reminder = this.createReminderElement({
            type: 'overdue',
            priority: 'high',
            title: '⚠️ 待办逾期提醒',
            content: overdueItems.length > 1
                ? `您有 ${overdueItems.length} 个待办事项已逾期`
                : overdueItems[0]?.content || overdueItems[0]?.message,
            items: overdueItems,
            agentName: data.agentName,
            todoId: data.todoId
        });

        this.displayReminder(reminder, data);
    }

    /**
     * 显示每日汇总
     */
    showDailySummary(data) {
        const summaryData = data.summary || {};
        const items = data.items || [];

        const reminder = this.createReminderElement({
            type: 'daily_summary',
            priority: 'normal',
            title: '📋 今日待办汇总',
            summary: {
                total: summaryData.total || items.length,
                completed: summaryData.completed || 0,
                pending: summaryData.pending || items.length,
                overdue: summaryData.overdue || 0
            },
            items: items,
            agentName: data.agentName,
            todoId: data.todoId
        });

        this.displayReminder(reminder, data);
    }

    /**
     * 创建提醒元素
     */
    createReminderElement(config) {
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

        const reminderEl = document.createElement('div');
        reminderEl.className = `todo-reminder-popup priority-${priority} type-${type}`;
        reminderEl.setAttribute('data-todo-id', todoId || Date.now());

        // 优先级图标
        const priorityIcon = this.getPriorityIcon(priority);

        // 构建 HTML
        let html = `
            <div class="todo-reminder-header">
                <div class="todo-reminder-title">
                    <span class="priority-icon">${priorityIcon}</span>
                    <span class="title-text">${this.escapeHtml(title)}</span>
                </div>
                <button class="todo-reminder-close" onclick="todoReminderManager.closeReminder(this)">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>
            <div class="todo-reminder-body">
        `;

        // 根据类型显示不同内容
        if (type === 'daily_summary' && summary) {
            html += this.renderDailySummary(summary, items);
        } else if (type === 'overdue' && items && items.length > 1) {
            html += this.renderOverdueList(items);
        } else {
            html += this.renderNormalContent(content, time, tags);
        }

        html += `</div>`;

        // 添加操作按钮
        html += `
            <div class="todo-reminder-actions">
                ${agentName ? `<span class="todo-agent-badge">${this.escapeHtml(agentName)}</span>` : ''}
                <button class="todo-action-btn btn-view" onclick="todoReminderManager.viewTodo('${todoId}')">查看详情</button>
                <button class="todo-action-btn btn-dismiss" onclick="todoReminderManager.dismissReminder('${todoId}')">稍后提醒</button>
                <button class="todo-action-btn btn-complete" onclick="todoReminderManager.completeTodo('${todoId}')">标记完成</button>
            </div>
        `;

        reminderEl.innerHTML = html;
        return reminderEl;
    }

    /**
     * 渲染每日汇总
     */
    renderDailySummary(summary, items) {
        let html = `
            <div class="summary-stats">
                <div class="stat-item">
                    <span class="stat-label">总计</span>
                    <span class="stat-value">${summary.total}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">已完成</span>
                    <span class="stat-value completed">${summary.completed}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">待办</span>
                    <span class="stat-value pending">${summary.pending}</span>
                </div>
                ${summary.overdue > 0 ? `
                <div class="stat-item">
                    <span class="stat-label">逾期</span>
                    <span class="stat-value overdue">${summary.overdue}</span>
                </div>
                ` : ''}
            </div>
        `;

        if (items && items.length > 0) {
            html += `<div class="summary-items-list">`;
            items.slice(0, 5).forEach(item => {
                html += `
                    <div class="summary-item">
                        <span class="item-priority priority-${item.priority || 'normal'}">${this.getPriorityIcon(item.priority)}</span>
                        <span class="item-content">${this.escapeHtml(item.content || item.message || item.title)}</span>
                    </div>
                `;
            });
            if (items.length > 5) {
                html += `<div class="summary-item-more">还有 ${items.length - 5} 项...</div>`;
            }
            html += `</div>`;
        }

        return html;
    }

    /**
     * 渲染逾期列表
     */
    renderOverdueList(items) {
        let html = `<div class="overdue-items-list">`;
        items.slice(0, 3).forEach(item => {
            html += `
                <div class="overdue-item">
                    <div class="overdue-item-header">
                        <span class="overdue-item-title">${this.escapeHtml(item.title || item.content || item.message)}</span>
                        ${item.scheduledTime ? `<span class="overdue-time">应于 ${this.formatTime(item.scheduledTime)} 完成</span>` : ''}
                    </div>
                    ${item.content && item.title !== item.content ? `<p class="overdue-item-content">${this.escapeHtml(item.content)}</p>` : ''}
                </div>
            `;
        });
        if (items.length > 3) {
            html += `<div class="overdue-item-more">还有 ${items.length - 3} 项逾期...</div>`;
        }
        html += `</div>`;
        return html;
    }

    /**
     * 渲染普通内容
     */
    renderNormalContent(content, time, tags) {
        let html = '';

        if (content) {
            html += `<p class="todo-content">${this.escapeHtml(content)}</p>`;
        }

        if (time) {
            html += `
                <div class="todo-time">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                    </svg>
                    <span>${this.formatTime(time)}</span>
                </div>
            `;
        }

        if (tags && tags.length > 0) {
            html += `
                <div class="todo-tags">
                    ${tags.map(tag => `<span class="todo-tag">${this.escapeHtml(tag)}</span>`).join('')}
                </div>
            `;
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
        const todoId = data.todoId || Date.now();
        this.activeReminders.set(todoId, {
            element: reminderEl,
            data: data
        });

        // 自动关闭（可选，根据配置）
        // setTimeout(() => this.closeReminder(reminderEl), 30000);
    }

    /**
     * 关闭提醒
     */
    closeReminder(element) {
        let reminderEl;

        if (typeof element === 'string') {
            // 通过 todoId 关闭
            const reminder = this.activeReminders.get(element);
            if (reminder) {
                reminderEl = reminder.element;
                this.activeReminders.delete(element);
            }
        } else if (element instanceof HTMLElement) {
            // 直接传入元素
            reminderEl = element.closest('.todo-reminder-popup');
            const todoId = reminderEl?.getAttribute('data-todo-id');
            if (todoId) {
                this.activeReminders.delete(todoId);
            }
        } else if (element?.target) {
            // 事件对象
            reminderEl = element.target.closest('.todo-reminder-popup');
            const todoId = reminderEl?.getAttribute('data-todo-id');
            if (todoId) {
                this.activeReminders.delete(todoId);
            }
        }

        if (reminderEl) {
            reminderEl.classList.remove('show');
            setTimeout(() => {
                if (reminderEl.parentNode) {
                    reminderEl.parentNode.removeChild(reminderEl);
                }
            }, 300);
        }
    }

    /**
     * 稍后提醒
     */
    dismissReminder(todoId) {
        this.closeReminder(todoId);
        // TODO: 可以发送消息到后端，设置稍后提醒
        console.log('稍后提醒:', todoId);
    }

    /**
     * 查看待办详情
     */
    viewTodo(todoId) {
        this.closeReminder(todoId);
        // TODO: 打开待办详情页面或面板
        console.log('查看待办:', todoId);

        // 可以通过 IPC 打开专门的待办管理窗口
        if (window.electronAPI && window.electronAPI.openTodoDetail) {
            window.electronAPI.openTodoDetail(todoId);
        }
    }

    /**
     * 标记完成
     */
    completeTodo(todoId) {
        this.closeReminder(todoId);
        // TODO: 发送完成请求到后端
        console.log('完成待办:', todoId);

        // 显示成功提示
        this.showToast('待办已标记为完成', 'success');
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
                return '🔴';
            case 'medium':
                return '🟡';
            case 'low':
                return '🟢';
            default:
                return '🔵';
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
}

// 创建全局实例
const todoReminderManager = new TodoReminderManager();

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = todoReminderManager;
}
