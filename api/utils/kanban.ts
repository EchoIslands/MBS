/**
 * 看板状态更新工具
 * 用于自动更新任务状态到 kanban-state.json
 */

import fs from 'fs'
import path from 'path'

const KANBAN_STATE_FILE = path.join(__dirname, '../kanban-state.json')

export interface KanbanTask {
  id: string
  title: string
  status: 'todo' | 'in-progress' | 'testing' | 'fixed' | 'done'
  completedAt?: string
  note?: string
}

export interface KanbanState {
  lastUpdated: string
  tasks: KanbanTask[]
}

// 读取当前状态
export const readKanbanState = (): KanbanState => {
  try {
    if (fs.existsSync(KANBAN_STATE_FILE)) {
      const data = fs.readFileSync(KANBAN_STATE_FILE, 'utf-8')
      return JSON.parse(data)
    }
  } catch (e) {
    console.error('Failed to read kanban state:', e)
  }
  return {
    lastUpdated: new Date().toISOString(),
    tasks: []
  }
}

// 更新任务状态
export const updateTaskStatus = (
  taskId: string,
  status: KanbanTask['status'],
  note?: string
): KanbanState => {
  const state = readKanbanState()
  
  const taskIndex = state.tasks.findIndex(t => t.id === taskId)
  if (taskIndex >= 0) {
    state.tasks[taskIndex] = {
      ...state.tasks[taskIndex],
      status,
      note: note || state.tasks[taskIndex].note,
      completedAt: status === 'done' ? new Date().toISOString() : state.tasks[taskIndex].completedAt
    }
  }
  
  state.lastUpdated = new Date().toISOString()
  
  try {
    fs.writeFileSync(KANBAN_STATE_FILE, JSON.stringify(state, null, 2))
    console.log(`✅ 看板状态已更新: ${taskId} -> ${status}`)
  } catch (e) {
    console.error('Failed to write kanban state:', e)
  }
  
  return state
}

// 更新任务进度
export const updateTaskProgress = (
  taskId: string,
  progress: KanbanTask['status'],
  note?: string
) => {
  return updateTaskStatus(taskId, progress, note)
}

// 标记任务为进行中
export const markTaskInProgress = (taskId: string, note?: string) => {
  return updateTaskStatus(taskId, 'in-progress', note)
}

// 标记任务为待测试
export const markTaskTesting = (taskId: string, note?: string) => {
  return updateTaskStatus(taskId, 'testing', note)
}

// 标记任务为已修复
export const markTaskFixed = (taskId: string, note?: string) => {
  return updateTaskStatus(taskId, 'fixed', note)
}

// 标记任务为完成
export const markTaskDone = (taskId: string, note?: string) => {
  return updateTaskStatus(taskId, 'done', note)
}

// 打印当前状态摘要
export const printKanbanSummary = () => {
  const state = readKanbanState()
  const summary = {
    total: state.tasks.length,
    todo: state.tasks.filter(t => t.status === 'todo').length,
    inProgress: state.tasks.filter(t => t.status === 'in-progress').length,
    testing: state.tasks.filter(t => t.status === 'testing').length,
    fixed: state.tasks.filter(t => t.status === 'fixed').length,
    done: state.tasks.filter(t => t.status === 'done').length,
  }
  
  console.log('\n=== 📊 看板状态摘要 ===')
  console.log(`总任务: ${summary.total}`)
  console.log(`待做: ${summary.todo}`)
  console.log(`进行中: ${summary.inProgress}`)
  console.log(`待测试: ${summary.testing}`)
  console.log(`已修复: ${summary.fixed}`)
  console.log(`完成: ${summary.done}`)
  console.log(`进度: ${Math.round((summary.done / summary.total) * 100)}%\n`)
}
