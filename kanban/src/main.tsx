/* eslint-disable react-refresh/only-export-components */
import React, { useState, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

const API_BASE = '/api'

// 状态定义
const STATUSES = [
  { id: 'todo', label: '待做', color: 'bg-slate-500', icon: '📋', light: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' },
  { id: 'in-progress', label: '进行中', color: 'bg-blue-500', icon: '🔨', light: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  { id: 'testing', label: '待测试', color: 'bg-amber-500', icon: '🧪', light: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  { id: 'fixed', label: '已修复', color: 'bg-emerald-500', icon: '✅', light: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  { id: 'done', label: '完成', color: 'bg-green-500', icon: '🎉', light: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
]

const PRIORITIES = [
  { id: 'low', label: '低', color: 'text-slate-500', bg: 'bg-slate-100' },
  { id: 'medium', label: '中', color: 'text-amber-600', bg: 'bg-amber-50' },
  { id: 'high', label: '高', color: 'text-orange-600', bg: 'bg-orange-50' },
  { id: 'urgent', label: '紧急', color: 'text-red-600', bg: 'bg-red-50' },
]

const ASSIGNEES = [
  { id: 'dev1', name: '后端工程师', avatar: '👨‍💻' },
  { id: 'dev2', name: '前端工程师', avatar: '👩‍💻' },
  { id: 'tester', name: '测试工程师', avatar: '🧑‍🔬' },
  { id: 'pm', name: '项目经理', avatar: '👔' },
]

// ========== 任务定义（含测试配置）==========
// 每个任务可以配置一组测试用例（scenarios），点击测试时会依次执行
const TASKS = [
  {
    id: 'task-1',
    title: '员工登录 API',
    description: '实现手机号+密码验证，JWT token 生成和验证',
    status: 'done',
    priority: 'high',
    assignee: 'dev1',
    tags: ['认证', 'JWT'],
    apiPath: '/auth/login',
    method: 'POST',
    scenarios: [
      { label: '正确账号', phone: '13900000011', password: '123456', expectedSuccess: true },
      { label: '错误密码', phone: '13900000011', password: 'wrong-password', expectedSuccess: false },
      { label: '不存在的手机号', phone: '00000000000', password: '123456', expectedSuccess: false },
    ],
  },
  {
    id: 'task-2',
    title: 'API 中间件',
    description: '请求鉴权、统一错误处理、响应格式标准化',
    status: 'done',
    priority: 'medium',
    assignee: 'dev1',
    tags: ['架构'],
    apiPath: '/health',
    method: 'GET',
    scenarios: [
      { label: '健康检查', expectedSuccess: true },
      { label: '访问不存在的路由（错误处理验证）', path: '/nonexistent-page', method: 'GET', expectedSuccess: false, customTest: true },
    ],
  },
  {
    id: 'task-3',
    title: '前端登录页对接',
    description: '改造 src/pages/shop/Login.tsx，对接真实 API',
    status: 'done',
    priority: 'high',
    assignee: 'dev2',
    tags: ['前端'],
    apiPath: '/auth/login',
    method: 'POST',
    scenarios: [
      { label: '前端登录页对接 - 正确账号', phone: '13900000011', password: '123456', expectedSuccess: true },
      { label: '前端登录页对接 - 错误密码', phone: '13900000011', password: '123456-wrong', expectedSuccess: false },
    ],
  },
  {
    id: 'task-4',
    title: '预约列表筛选 API',
    description: '按状态/时间筛选、分页 API 实现',
    status: 'done',
    priority: 'medium',
    assignee: 'dev1',
    tags: ['预约'],
    apiPath: '/bookings',
    method: 'GET',
    scenarios: [
      { label: '获取预约列表（带分页）', expectedSuccess: true },
    ],
  },
  {
    id: 'task-5',
    title: '队列管理 API',
    description: '叫号、跳过、重置队列功能',
    status: 'done',
    priority: 'high',
    assignee: 'dev1',
    tags: ['排队'],
    apiPath: '/queues',
    method: 'GET',
    scenarios: [
      { label: '获取队列信息', expectedSuccess: true },
    ],
  },
  { id: 'task-6', title: '预约管理页面对接', description: 'BookingManagement.tsx 对接真实 API', status: 'todo', priority: 'medium', assignee: 'dev2', tags: ['前端'] },
  { id: 'task-7', title: '客户 CRUD API', description: '新增、编辑、删除、搜索客户', status: 'todo', priority: 'high', assignee: 'dev1', tags: ['客户'] },
  { id: 'task-8', title: '客户画像 API', description: '客户偏好字段的获取和更新', status: 'todo', priority: 'medium', assignee: 'dev1', tags: ['客户'] },
  { id: 'task-9', title: '到店记录 API', description: 'check-in/check-out 功能', status: 'todo', priority: 'medium', assignee: 'dev1', tags: ['客户'] },
  { id: 'task-10', title: '财务报表聚合 API', description: '按日/周/月/年聚合营收、服务数、客单价', status: 'todo', priority: 'high', assignee: 'dev1', tags: ['财务'] },
  { id: 'task-11', title: '发型师业绩 API', description: '个人营收、服务数、评分统计', status: 'todo', priority: 'medium', assignee: 'dev1', tags: ['财务'] },
  { id: 'task-12', title: '会员管理 API', description: '升级、权益查看、推荐提成', status: 'todo', priority: 'medium', assignee: 'dev1', tags: ['会员'] },
  { id: 'task-13', title: '退款申请 API', description: '创建、审批、处理退款', status: 'todo', priority: 'high', assignee: 'dev1', tags: ['退款'] },
  { id: 'task-14', title: '评价管理 API', description: '列表、回复、隐藏评价', status: 'todo', priority: 'medium', assignee: 'dev1', tags: ['评价'] },
  { id: 'task-15', title: '商品 CRUD API', description: '商品增删改查、库存管理', status: 'todo', priority: 'medium', assignee: 'dev1', tags: ['商品'] },
  { id: 'task-16', title: '购物车+订单 API', description: '购物车操作、订单创建和状态管理', status: 'todo', priority: 'high', assignee: 'dev1', tags: ['商品'] },
]

interface Scenario {
  label?: string
  phone?: string
  password?: string
  path?: string
  method?: string
  expectedSuccess?: boolean
  customTest?: boolean
  [key: string]: unknown
}

interface Task {
  id: string
  title: string
  description: string
  status: string
  priority: string
  assignee: string
  tags: string[]
  apiPath?: string
  method?: string
  scenarios?: Scenario[]
  createdAt?: string
  updatedAt?: string
}

interface KanbanState {
  tasks?: Task[]
}

const fetchKanbanState = async (): Promise<KanbanState | null> => {
  try {
    const res = await fetch(`${API_BASE}/kanban`)
    if (!res.ok) return null
    return (await res.json()) as KanbanState
  } catch {
    return null
  }
}

// ========== 顶部进度条和统计卡片（全部可点击）==========
const StatsPanel: React.FC<{ tasks: Task[]; onStatusClick: (status: string) => void }> = ({ tasks, onStatusClick }) => {
  const total = tasks.length
  const done = tasks.filter(t => t.status === 'done').length
  const inProgress = tasks.filter(t => t.status === 'in-progress').length
  const todo = tasks.filter(t => t.status === 'todo').length
  const testing = tasks.filter(t => t.status === 'testing').length
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="bg-gradient-to-br from-blue-50 via-white to-green-50 rounded-2xl border border-blue-100 p-6 mb-6 shadow-sm">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">📊 项目进度总览</h2>
          <p className="text-sm text-slate-500 mt-1">点击下方数字卡片查看对应状态下的所有任务</p>
        </div>
        <div className="text-right">
          <div className="text-5xl font-extrabold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">{progress}%</div>
          <p className="text-sm text-slate-500 mt-1">完成进度</p>
        </div>
      </div>

      <div className="relative h-5 bg-slate-200 rounded-full overflow-hidden mb-5">
        <div
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 via-emerald-500 to-green-500 transition-all duration-700"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <button
          onClick={() => onStatusClick('all')}
          className="p-4 bg-white rounded-xl border border-slate-200 text-center hover:bg-slate-50 hover:border-slate-300 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="text-3xl font-bold text-slate-700">{total}</div>
          <div className="text-xs text-slate-500 mt-1">总任务</div>
          <div className="text-xs text-blue-600 mt-1 font-medium">👆 点击查看</div>
        </button>

        <button
          onClick={() => onStatusClick('todo')}
          className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center hover:bg-slate-100 hover:border-slate-400 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="text-3xl font-bold text-slate-600">{todo}</div>
          <div className="text-xs text-slate-500 mt-1">待做</div>
          <div className="text-xs text-blue-600 mt-1 font-medium">👆 点击查看</div>
        </button>

        <button
          onClick={() => onStatusClick('in-progress')}
          className="p-4 bg-blue-50 rounded-xl border border-blue-200 text-center hover:bg-blue-100 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="text-3xl font-bold text-blue-600">{inProgress}</div>
          <div className="text-xs text-blue-500 mt-1">进行中</div>
          <div className="text-xs text-blue-600 mt-1 font-medium">👆 点击查看</div>
        </button>

        <button
          onClick={() => onStatusClick('testing')}
          className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-center hover:bg-amber-100 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="text-3xl font-bold text-amber-600">{testing}</div>
          <div className="text-xs text-amber-500 mt-1">待测试</div>
          <div className="text-xs text-amber-700 mt-1 font-medium">👆 点击查看</div>
        </button>

        <button
          onClick={() => onStatusClick('done')}
          className="p-4 bg-green-50 rounded-xl border border-green-200 text-center hover:bg-green-100 hover:border-green-400 hover:shadow-md transition-all cursor-pointer"
        >
          <div className="text-3xl font-bold text-green-600">{done}</div>
          <div className="text-xs text-green-500 mt-1">完成</div>
          <div className="text-xs text-green-700 mt-1 font-medium">👆 点击查看</div>
        </button>
      </div>
    </div>
  )
}

// ========== 已完成任务汇总区（每个任务都有自己的测试按钮）==========
const DoneTasksPanel: React.FC<{ tasks: Task[]; onTaskTest: (taskId: string) => void; onTaskClick: (task: Task) => void }> = ({ tasks, onTaskTest, onTaskClick }) => {
  const doneTasks = tasks.filter(t => t.status === 'done')
  if (doneTasks.length === 0) return null

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border-2 border-green-300 p-6 mb-6 shadow-md">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-green-800">🎉 已完成的任务（{doneTasks.length}）</h2>
          <p className="text-sm text-green-700 mt-1">以下功能已经开发完成。点击「测试」按钮可以验证每个任务的 API 是否正常</p>
        </div>
      </div>

      <div className="grid gap-3">
        {doneTasks.map((task, index) => {
          const priority = PRIORITIES.find(p => p.id === task.priority)
          const assignee = ASSIGNEES.find(a => a.id === task.assignee)
          const hasTest = task.scenarios && task.scenarios.length > 0
          return (
            <div
              key={task.id}
              className="p-4 bg-white rounded-xl border-2 border-green-200 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3 flex-wrap">
                <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-xl font-bold text-green-700">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => onTaskClick(task)}
                      className="font-bold text-slate-800 text-base hover:text-blue-600 transition-colors"
                    >
                      {task.title}
                    </button>
                    {priority && <span className={`px-2 py-0.5 text-xs rounded ${priority.bg} ${priority.color} font-medium`}>{priority.label}优先级</span>}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{task.description}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
                    <span className="text-slate-500">📡 API: <code className="font-mono text-slate-700 bg-slate-100 px-1 rounded">{task.apiPath}</code></span>
                    <span className="text-slate-500">方法: <code className="font-mono text-slate-700 bg-slate-100 px-1 rounded">{task.method}</code></span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {task.tags.length > 0 && task.tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded">{tag}</span>
                    ))}
                    {assignee && <span className="text-sm text-slate-500">👤 {assignee.avatar} {assignee.name}</span>}
                  </div>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  <span className="text-2xl">✅</span>
                  {hasTest && (
                    <button
                      onClick={() => onTaskTest(task.id)}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold text-sm shadow-sm hover:shadow transition-colors whitespace-nowrap"
                    >
                      🔬 测试
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ========== 通用 API 测试面板（根据任务动态生成内容）==========
const TaskTestPanel: React.FC<{ task: Task; onClose: () => void }> = ({ task, onClose }) => {
  const [results, setResults] = useState<unknown[]>([])
  const [testing, setTesting] = useState(false)

  const runTest = useCallback(async (scenario: Scenario, index: number) => {
    const startTime = Date.now()
    try {
      let body = ''
      const headers: Record<string, string> = {}

      if (task.method === 'POST' || task.method === 'PUT') {
        headers['Content-Type'] = 'application/json'
        const payload: Record<string, string> = {}
        if (scenario.phone) payload.phone = scenario.phone
        if (scenario.password) payload.password = scenario.password
        body = JSON.stringify(payload)
      }

      const actualPath = scenario.path || task.apiPath
      const url = `${API_BASE}${actualPath}`

      const resp = await fetch(url, {
        method: (scenario.method || task.method || 'GET'),
        headers,
        body: body || undefined,
      })
      const data = await resp.json()
      const duration = Date.now() - startTime

      return {
        ...scenario,
        index,
        duration,
        success: data.success === true,
        response: data,
        error: data.error || null,
      }
    } catch (e: unknown) {
      return {
        ...scenario,
        index,
        success: false,
        error: e instanceof Error ? e.message : '网络错误',
        response: null,
      }
    }
  }, [task.method, task.apiPath])

  const runAll = useCallback(async () => {
    setTesting(true)
    setResults([])
    const testResults = []
    for (let i = 0; i < (task.scenarios || []).length; i++) {
      const sc = task.scenarios![i]
      const result = await runTest(sc, i)
      testResults.push(result)
      setResults([...testResults])
    }
    setTesting(false)
  }, [task.scenarios, runTest])

  useEffect(() => {
    // 打开时自动运行一次测试
    runAll()
  }, [task.id, runAll])

  const totalCount = results.length
  const passCount = results.filter(r => r.success === r.expectedSuccess).length
  const allPassed = totalCount > 0 && totalCount === (task.scenarios?.length || 0) && passCount === totalCount

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-bold text-slate-800">🔬 {task.title} - API 测试</h2>
              </div>
              <p className="text-sm text-slate-500 mt-2">
                <code className="font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                  {task.method || 'GET'} {API_BASE}{task.apiPath}
                </code>
              </p>
              <p className="text-sm text-slate-600 mt-2">{task.description}</p>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-slate-100 text-slate-500 text-xl font-bold flex-shrink-0">×</button>
          </div>

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <button
              onClick={runAll}
              disabled={testing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white rounded-lg font-semibold text-sm transition-colors"
            >
              {testing ? '⏳ 测试中...' : '🔄 重新运行测试'}
            </button>
            {allPassed && (
              <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-bold">
                ✅ 全部测试通过 ({passCount}/{totalCount})
              </span>
            )}
            {!allPassed && totalCount > 0 && !testing && (
              <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-sm font-bold">
                ⚠️ 部分测试通过 ({passCount}/{totalCount})
              </span>
            )}
          </div>
        </div>

        <div className="p-6 space-y-3">
          {(task.scenarios || []).map((sc, idx) => {
            const result = results.find(r => r.index === idx)
            const isRunning = testing && !result
            const passed = result && result.success === sc.expectedSuccess

            return (
              <div key={idx} className={`p-4 rounded-xl border-2 ${passed ? 'border-green-200 bg-green-50' : result ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="font-bold text-slate-800">用例 {idx + 1}: {sc.label}</div>
                  <div>
                    {isRunning && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">⏳ 测试中...</span>}
                    {passed && <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">✅ 通过</span>}
                    {result && !passed && <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">❌ 未通过</span>}
                    {!result && !testing && <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-bold">⏸ 待测试</span>}
                  </div>
                </div>

                {/* 请求参数 */}
                <div className="text-xs text-slate-500 mb-2 font-mono">
                  {task.method === 'POST' && (sc.phone || sc.password) && (
                    <span>请求: phone="{sc.phone || '-'}" {sc.password ? 'password="***"' : ''}</span>
                  )}
                </div>

                {/* 响应结果 */}
                {result && (
                  <div className="mt-2">
                    <div className="text-xs text-slate-500 mb-1">
                      响应: {result.duration !== undefined && `用时 ${result.duration}ms · `}
                      {result.success ? 'success=true' : 'success=false'}
                    </div>
                    {result.response && (
                      <pre className="p-3 bg-slate-900 text-green-400 rounded-lg text-xs overflow-x-auto font-mono whitespace-pre-wrap max-h-48">
{JSON.stringify(result.response, null, 2)}
                      </pre>
                    )}
                    {result.error && !result.response && (
                      <div className="p-2 bg-red-100 border border-red-200 rounded text-red-700 text-xs">错误: {result.error}</div>
                    )}
                    <div className="text-xs text-slate-500 mt-1">期望结果: {sc.expectedSuccess ? '✅ success=true' : '❌ success=false'} · 实际: {result.success ? '✅ success=true' : '❌ success=false'}</div>
                  </div>
                )}
              </div>
            )
          })}

          {/* 测试汇总 */}
          <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-sm text-slate-700">
              <strong>测试说明:</strong> 每个用例会根据任务的 API 路径自动发送请求，验证返回结果是否符合预期。
              已完成的任务应能通过全部测试；未完成的任务会显示该功能尚未完成对接。
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== 按状态查看任务列表的弹窗==========
const StatusListPanel: React.FC<{ status: string; tasks: Task[]; onClose: () => void; onTaskClick: (task: Task) => void; onTaskTest: (taskId: string) => void }> = ({ status, tasks, onClose, onTaskClick, onTaskTest }) => {
  let filtered: Task[] = []
  let title = ''
  let colorClass = 'border-slate-200 bg-slate-50'

  if (status === 'all') {
    filtered = tasks
    title = '全部任务'
    colorClass = 'border-blue-200 bg-blue-50'
  } else {
    const statusDef = STATUSES.find(s => s.id === status)
    filtered = tasks.filter(t => t.status === status)
    title = `${statusDef?.icon} ${statusDef?.label}的任务`
    colorClass = `${statusDef?.border} ${statusDef?.light}`
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">{title}（{filtered.length}）</h2>
              <p className="text-sm text-slate-500 mt-1">点击任务标题可查看详情 · 已完成的任务可以点击「测试」按钮验证 API</p>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-slate-100 text-slate-500 text-xl font-bold flex-shrink-0">×</button>
          </div>
        </div>

        <div className="p-6 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <div className="text-6xl mb-3">📭</div>
              <div>暂无任务</div>
            </div>
          ) : (
            filtered.map((task, index) => {
              const priority = PRIORITIES.find(p => p.id === task.priority)
              const assignee = ASSIGNEES.find(a => a.id === task.assignee)
              const statusDef = STATUSES.find(s => s.id === task.status)
              const hasTest = task.scenarios && task.scenarios.length > 0 && task.status === 'done'

              return (
                <div key={task.id} className={`p-4 rounded-xl border-2 ${colorClass} shadow-sm hover:shadow-md transition-all`}>
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex-shrink-0 w-10 h-10 bg-white rounded-lg flex items-center justify-center text-xl font-bold text-slate-600 border border-slate-200">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => onTaskClick(task)}
                          className="font-bold text-slate-800 text-base hover:text-blue-600 transition-colors"
                        >
                          {task.title}
                        </button>
                        {priority && <span className={`px-2 py-0.5 text-xs rounded ${priority.bg} ${priority.color} font-medium`}>{priority.label}优先级</span>}
                        {statusDef && <span className="px-2 py-0.5 text-xs rounded bg-white text-slate-600 border border-slate-200 font-medium">{statusDef.icon} {statusDef.label}</span>}
                      </div>
                      <p className="text-sm text-slate-600 mt-1">{task.description}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
                        {task.apiPath && (
                          <span className="text-slate-500">
                            📡 <code className="font-mono text-slate-700 bg-white px-1 rounded">{task.apiPath}</code>
                          </span>
                        )}
                        {task.tags.length > 0 && task.tags.map(tag => (
                          <span key={tag} className="px-2 py-0.5 text-xs bg-white text-slate-600 rounded border border-slate-200">{tag}</span>
                        ))}
                        {assignee && <span className="text-sm text-slate-500">👤 {assignee.avatar} {assignee.name}</span>}
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      {task.status === 'done' && <span className="text-2xl">✅</span>}
                      {task.status === 'todo' && <span className="text-2xl">📋</span>}
                      {task.status === 'in-progress' && <span className="text-2xl">🔨</span>}
                      {task.status === 'testing' && <span className="text-2xl">🧪</span>}
                      {hasTest && (
                        <button
                          onClick={() => onTaskTest(task.id)}
                          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold text-sm shadow-sm hover:shadow transition-colors whitespace-nowrap"
                        >
                          🔬 测试
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ========== 单个任务详情弹窗（含测试）==========
const TaskDetailPanel: React.FC<{ task: Task; onClose: () => void; onTest: () => void }> = ({ task, onClose, onTest }) => {
  const priority = PRIORITIES.find(p => p.id === task.priority)
  const assignee = ASSIGNEES.find(a => a.id === task.assignee)
  const statusDef = STATUSES.find(s => s.id === task.status)
  const hasTest = task.scenarios && task.scenarios.length > 0 && task.status === 'done'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-slate-800">{task.title}</h2>
              <p className="text-sm text-slate-600 mt-2">{task.description}</p>
            </div>
            <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-slate-100 text-slate-500 text-xl font-bold flex-shrink-0">×</button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs text-slate-500 mb-1">状态</div>
              <div className="font-bold text-slate-800">{statusDef?.icon} {statusDef?.label}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs text-slate-500 mb-1">优先级</div>
              <div className="font-bold text-slate-800">{priority?.label}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs text-slate-500 mb-1">负责人</div>
              <div className="font-bold text-slate-800">{assignee?.avatar} {assignee?.name}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs text-slate-500 mb-1">标签</div>
              <div className="font-bold text-slate-800">{task.tags.join(' / ') || '-'}</div>
            </div>
          </div>

          {task.apiPath && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-xs text-blue-600 font-semibold mb-1">API 信息</div>
              <div className="font-mono text-sm text-blue-800">
                <code>{task.method} {API_BASE}{task.apiPath}</code>
              </div>
              {task.scenarios && task.scenarios.length > 0 && (
                <div className="text-xs text-blue-600 mt-2">测试用例数: {task.scenarios.length} 个</div>
              )}
            </div>
          )}

          {!hasTest && task.status === 'done' && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <div className="text-xs text-amber-700">
                ⚠️ 此任务已完成但暂未配置自动化测试用例。可以手动调用 API {task.apiPath} 进行验证。
              </div>
            </div>
          )}

          {task.status !== 'done' && (
            <div className="p-3 bg-slate-100 rounded-lg border border-slate-200">
              <div className="text-sm text-slate-600">
                🚧 此任务尚未完成，当前状态：{statusDef?.icon} {statusDef?.label}。完成后可以在这里进行 API 测试。
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-semibold text-sm transition-colors"
            >
              关闭
            </button>
            {hasTest && (
              <button
                onClick={onTest}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors"
              >
                🔬 运行测试
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== 看板列组件==========
const KanbanColumn: React.FC<{ status: typeof STATUSES[0]; tasks: Task[]; onTaskClick: (task: Task) => void; onTaskTest: (taskId: string) => void }> = ({ status, tasks, onTaskClick, onTaskTest }) => {
  return (
    <div className="flex-shrink-0 w-full md:w-[320px] lg:w-[340px]">
      <div className={`${status.light} rounded-xl p-4 border ${status.border}`}>
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200/50">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{status.icon}</span>
            <span className="font-bold text-slate-700 text-lg">{status.label}</span>
          </div>
          <span className="px-3 py-1 bg-white rounded-full text-sm font-bold text-slate-700">{tasks.length}</span>
        </div>
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {tasks.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm bg-white/50 rounded-lg">暂无任务</div>
          ) : (
            tasks.map(task => {
              const priority = PRIORITIES.find(p => p.id === task.priority)
              const assignee = ASSIGNEES.find(a => a.id === task.assignee)
              const hasTest = task.scenarios && task.scenarios.length > 0 && task.status === 'done'
              return (
                <div key={task.id} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      {task.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded">{tag}</span>
                      ))}
                    </div>
                    {hasTest && (
                      <button
                        onClick={() => onTaskTest(task.id)}
                        className="px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs font-bold flex-shrink-0"
                      >
                        🔬 测试
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => onTaskClick(task)}
                    className="font-semibold text-slate-800 text-sm text-left hover:text-blue-600 transition-colors w-full"
                  >
                    {task.title}
                  </button>
                  {task.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{task.description}</p>}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                    {priority && <span className={`px-2 py-0.5 text-xs rounded ${priority.bg} ${priority.color} font-medium`}>{priority.label}</span>}
                    {assignee && <span className="text-sm text-slate-500">{assignee.avatar}</span>}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

// ========== 主应用==========
const App: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(TASKS)
  const [testTaskId, setTestTaskId] = useState<string | null>(null)
  const [viewStatus, setViewStatus] = useState<string | null>(null)
  const [viewTask, setViewTask] = useState<Task | null>(null)
  const [isApiAvailable, setIsApiAvailable] = useState(false)

  useEffect(() => {
    const init = async () => {
      const state = await fetchKanbanState()
      if (state && state.tasks && state.tasks.length > 0) {
        const merged = TASKS.map(task => {
          const apiTask = state.tasks.find((t: Task) => t.id === task.id)
          return apiTask ? { ...task, status: apiTask.status } : task
        })
        setTasks(merged)
        setIsApiAvailable(true)
      }
    }
    init()
  }, [])

  const refreshFromApi = async () => {
    const state = await fetchKanbanState()
    if (state && state.tasks) {
      const merged = TASKS.map(task => {
        const apiTask = state.tasks.find((t: Task) => t.id === task.id)
        return apiTask ? { ...task, status: apiTask.status } : task
      })
      setTasks(merged)
    }
  }

  const currentTestTask = testTaskId ? tasks.find(t => t.id === testTaskId) : null
  const handleTaskTest = (taskId: string) => {
    setViewTask(null)
    setViewStatus(null)
    setTestTaskId(taskId)
  }

  const handleTaskClick = (task: Task) => {
    setTestTaskId(null)
    setViewStatus(null)
    setViewTask(task)
  }

  const handleStatusClick = (status: string) => {
    setTestTaskId(null)
    setViewTask(null)
    setViewStatus(status)
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-5 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">🎯 MBS 后端开发看板</h1>
              <p className="text-sm text-slate-500 mt-1">美发 SaaS 系统 · {isApiAvailable ? '✅ 已连接服务器' : '📴 离线模式'}</p>
            </div>
            <button
              onClick={refreshFromApi}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
            >
              🔄 刷新状态
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 py-6">
        <StatsPanel tasks={tasks} onStatusClick={handleStatusClick} />

        <DoneTasksPanel tasks={tasks} onTaskTest={handleTaskTest} onTaskClick={handleTaskClick} />

        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-700 mb-1">📋 全部任务看板</h2>
          <p className="text-sm text-slate-500">点击任务卡片查看详情 · 已完成的任务可点击「测试」按钮运行 API 测试</p>
        </div>

        <div className="flex flex-wrap md:flex-nowrap gap-4 md:gap-5 pb-6">
          {STATUSES.map(status => (
            <KanbanColumn
              key={status.id}
              status={status}
              tasks={tasks.filter(t => t.status === status.id)}
              onTaskClick={handleTaskClick}
              onTaskTest={handleTaskTest}
            />
          ))}
        </div>

        <div className="mt-6 p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-700 mb-2 text-base">📖 使用说明</h3>
          <ul className="text-sm text-slate-600 space-y-1.5">
            <li>• ✅ 顶部「项目进度总览」的 5 个数字卡片都是可点击按钮，查看对应状态下的所有任务</li>
            <li>• ✅ 已完成任务区域的每个任务都有自己的「🔬 测试」按钮，点击即可测试该任务的 API</li>
            <li>• ✅ 下方看板的每个任务卡片标题可以点击查看详情，已完成的任务卡片右上角也有「🔬 测试」按钮</li>
            <li>• ✅ 每个测试用例会自动发送请求并验证返回结果是否符合预期</li>
            <li>• 点击「🔄 刷新状态」按钮可以同步服务器最新数据</li>
          </ul>
        </div>
      </main>

      {currentTestTask && <TaskTestPanel task={currentTestTask} onClose={() => setTestTaskId(null)} />}
      {viewStatus && <StatusListPanel status={viewStatus} tasks={tasks} onClose={() => setViewStatus(null)} onTaskClick={handleTaskClick} onTaskTest={handleTaskTest} />}
      {viewTask && <TaskDetailPanel task={viewTask} onClose={() => setViewTask(null)} onTest={() => handleTaskTest(viewTask.id)} />}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('app')!).render(<App />)
