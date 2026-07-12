/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import shopsRoutes from './routes/shops.js'
import bookingsRoutes from './routes/bookings.js'
import reviewsRoutes from './routes/reviews.js'
import queuesRoutes from './routes/queues.js'
import customersRoutes from './routes/customers.js'
import visitsRoutes from './routes/visits.js'
import reportsRoutes from './routes/reports.js'
import stylistsRoutes from './routes/stylists.js'
import membersRoutes from './routes/members.js'
import refundsRoutes from './routes/refunds.js'
import reviewsManageRoutes from './routes/reviews-manage.js'
import productsRoutes from './routes/products.js'
import ordersRoutes from './routes/orders.js'

// 导入中间件
import { logger, errorHandler } from './middleware/index.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

const app: express.Application = express()

// 使用中间件
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(logger)

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/shops', shopsRoutes)
app.use('/api/bookings', bookingsRoutes)
app.use('/api/reviews', reviewsRoutes)
app.use('/api/queues', queuesRoutes)
app.use('/api/customers', customersRoutes)
app.use('/api/visits', visitsRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/stylists', stylistsRoutes)
app.use('/api/members', membersRoutes)
app.use('/api/refunds', refundsRoutes)
app.use('/api/reviews-manage', reviewsManageRoutes)
app.use('/api/products', productsRoutes)
app.use('/api/orders', ordersRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response, _next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * 看板任务状态 API
 * GET /api/kanban - 获取所有任务状态
 * PUT /api/kanban - 更新任务状态
 */
const KANBAN_STATE_FILE = path.join(__dirname, '..', 'kanban-state.json')

app.get('/api/kanban', (req: Request, res: Response) => {
  try {
    if (fs.existsSync(KANBAN_STATE_FILE)) {
      const data = fs.readFileSync(KANBAN_STATE_FILE, 'utf-8')
      res.json(JSON.parse(data))
    } else {
      res.status(404).json({ error: '看板状态文件不存在' })
    }
  } catch (_err) {
    res.status(500).json({ error: '读取看板状态失败' })
  }
})

app.put('/api/kanban', (req: Request, res: Response) => {
  try {
    const { taskId, status } = req.body
    if (!taskId || !status) {
      res.status(400).json({ error: '缺少 taskId 或 status' })
      return
    }
    
    let state = { lastUpdated: new Date().toISOString(), tasks: [] as unknown[] }
    if (fs.existsSync(KANBAN_STATE_FILE)) {
      const data = fs.readFileSync(KANBAN_STATE_FILE, 'utf-8')
      state = JSON.parse(data)
    }
    
    const taskIndex = state.tasks.findIndex((t: unknown) => t.id === taskId)
    if (taskIndex >= 0) {
      state.tasks[taskIndex].status = status
    }
    state.lastUpdated = new Date().toISOString()
    
    fs.writeFileSync(KANBAN_STATE_FILE, JSON.stringify(state, null, 2))
    res.json({ success: true, task: state.tasks[taskIndex] })
  } catch (_err) {
    res.status(500).json({ error: '更新看板状态失败' })
  }
})

/**
 * 批量更新看板任务状态
 * PUT /api/kanban/batch
 */
app.put('/api/kanban/batch', (req: Request, res: Response) => {
  try {
    const { tasks } = req.body
    if (!tasks || !Array.isArray(tasks)) {
      res.status(400).json({ error: '缺少 tasks 数组' })
      return
    }
    
    let state = { lastUpdated: new Date().toISOString(), tasks: [] as unknown[] }
    if (fs.existsSync(KANBAN_STATE_FILE)) {
      const data = fs.readFileSync(KANBAN_STATE_FILE, 'utf-8')
      state = JSON.parse(data)
    }
    
    tasks.forEach((update: unknown) => {
      const taskIndex = state.tasks.findIndex((t: unknown) => t.id === update.taskId)
      if (taskIndex >= 0) {
        state.tasks[taskIndex].status = update.status
      }
    })
    state.lastUpdated = new Date().toISOString()
    
    fs.writeFileSync(KANBAN_STATE_FILE, JSON.stringify(state, null, 2))
    res.json({ success: true, tasks: state.tasks })
  } catch (_err) {
    res.status(500).json({ error: '批量更新看板状态失败' })
  }
})

/**
 * error handler middleware
 */
app.use(errorHandler)

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
