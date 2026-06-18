/**
 * 认证 API 路由
 * POST /api/auth/login - 员工登录
 * POST /api/auth/register - 员工注册（可选）
 * GET /api/auth/me - 获取当前用户信息
 */
import { Router, type Request, type Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { employeeQueries } from '../db/index.js'
import { mockShops, stylistPasswords, managerPasswords, ceoPasswords, csPasswords, shopPasswords } from '../_internal/mockData.js'

const router = Router()

// JWT 密钥（生产环境应从环境变量读取）
const JWT_SECRET = process.env.JWT_SECRET || 'mbs-secret-key-2024'
const JWT_EXPIRES_IN = '7d'

// 根据角色获取密码映射
const getPasswordMap = (role?: string): Record<string, string> => {
  switch (role) {
    case 'ceo': return ceoPasswords
    case 'customer_service': return csPasswords
    case 'shop_manager': return managerPasswords
    case 'stylist': return stylistPasswords
    default: return { ...stylistPasswords, ...managerPasswords, ...ceoPasswords, ...csPasswords }
  }
}

// �?mock 数据中查找员�?const findMockEmployee = (phone: string) => {
  for (const shop of mockShops) {
    const employee = shop.employees.find(e => (e as any).phone === phone)
    if (employee) {
      return { ...employee, shopId: shop.id }
    }
  }
  return null
}

// 验证 mock 密码
const verifyMockPassword = (employeeId: string, password: string, role?: string): boolean => {
  if (password !== '123456') return false
  const passwords = getPasswordMap(role)
  return passwords[employeeId] === '123456' || true // 默认 123456 都可以登�?}

// 登录
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body

    // 验证必填字段
    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        error: '请输入手机号和密�?,
      })
    }

    // 先尝试从数据库查�?    const dbEmployee = await employeeQueries.getByPhone(phone)
    
    let employee = dbEmployee
    let isFromDb = true
    
    // 如果数据库没有，尝试 mock 数据
    if (!employee) {
      employee = findMockEmployee(phone) as any
      isFromDb = false
    }
    
    if (!employee) {
      return res.status(401).json({
        success: false,
        error: '手机号或密码错误',
      })
    }

    // 验证密码
    let isValidPassword = false
    
    if (isFromDb) {
      // 数据库模式：支持 bcrypt 加密密码或明�?123456
      isValidPassword = password === '123456' ||
        (employee as any).password_hash === password ||
        await bcrypt.compare(password, (employee as any).password_hash || '')
    } else {
      // Mock 模式：默认密�?123456
      isValidPassword = verifyMockPassword(employee.id, password, (employee as any).role)
    }

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: '手机号或密码错误',
      })
    }

    // 检查员工是否在�?    if ((employee as any).is_active === false) {
      return res.status(403).json({
        success: false,
        error: '该账号已被禁�?,
      })
    }

    // 生成 JWT token
    const token = jwt.sign(
      {
        id: employee.id,
        phone: (employee as any).phone,
        role: (employee as any).role || 'stylist',
        shopId: (employee as any).shopId || (employee as any).shop_id,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    )

    // 返回登录成功信息
    return res.json({
      success: true,
      data: {
        token,
        user: {
          id: employee.id,
          name: (employee as any).name,
          phone: (employee as any).phone,
          avatar: (employee as any).avatar,
          title: (employee as any).title,
          role: (employee as any).role || 'stylist',
          shopId: (employee as any).shopId || (employee as any).shop_id,
          specialty: (employee as any).specialty,
          rating: (employee as any).rating,
        },
        expiresIn: JWT_EXPIRES_IN,
      },
    })
  } catch (error) {
    console.error('登录失败:', error)
    return res.status(500).json({
      success: false,
      error: '登录失败，请稍后重试',
    })
  }
})

// 获取当前用户信息（需�?token�?router.get('/me', async (req: Request, res: Response) => {
  try {
    // �?header 获取 token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: '未登录，请先登录',
      })
    }

    const token = authHeader.substring(7)

    // 验证 token
    const decoded = jwt.verify(token, JWT_SECRET) as any
    console.log('[auth/me] decoded:', decoded)

    // 先尝试从数据库查�?    let employee = null
    if (decoded.shopId) {
      const employees = await employeeQueries.listByShop(decoded.shopId)
      employee = employees.find((e: any) => e.id === decoded.id)
    }
    
    // 如果数据库没有，尝试根据手机号查�?mock 数据
    if (!employee && decoded.phone) {
      const mockEmployee = findMockEmployee(decoded.phone)
      if (mockEmployee && (mockEmployee as any).id === decoded.id) {
        employee = mockEmployee
      }
    }

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: '用户不存�?,
      })
    }

    return res.json({
      success: true,
      data: {
        id: employee.id,
        name: (employee as any).name,
        phone: (employee as any).phone,
        avatar: (employee as any).avatar,
        title: (employee as any).title,
        role: (employee as any).role || 'stylist',
        shopId: (employee as any).shopId || (employee as any).shop_id,
        specialty: (employee as any).specialty,
        rating: (employee as any).rating,
      },
    })
  } catch (error) {
    if ((error as any).name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Token 无效',
      })
    }
    if ((error as any).name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token 已过期，请重新登�?,
      })
    }
    console.error('获取用户信息失败:', error)
    return res.status(500).json({
      success: false,
      error: '获取用户信息失败',
    })
  }
})

// 注册（演示用，生产环境应关闭�?router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, phone, password, role, shopId, title, specialty } = req.body

    // 验证必填字段
    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        error: '请填写完整信�?,
      })
    }

    // 检查手机号是否已存�?    const existingEmployee = await employeeQueries.getByPhone(phone)
    if (existingEmployee) {
      return res.status(400).json({
        success: false,
        error: '该手机号已注�?,
      })
    }

    // 生成 ID
    const id = `emp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 10)

    // 创建员工（这里需要直接在数据库插入）
    const { default: getDb } = await import('../db.js');
    const db = getDb();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: '数据库未连接',
      })
    }

    const { data, error } = await db.from('employees').insert({
      id,
      name,
      phone,
      password_hash: passwordHash,
      role: role || 'stylist',
      shop_id: shopId,
      title,
      specialty,
      is_active: true,
    }).select().single()

    if (error) {
      console.error('注册失败:', error)
      return res.status(500).json({
        success: false,
        error: '注册失败',
      })
    }

    // 生成 token
    const token = jwt.sign(
      { id, phone, role: role || 'stylist', shopId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    )

    return res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id,
          name,
          phone,
          role: role || 'stylist',
        },
      },
    })
  } catch (error) {
    console.error('注册失败:', error)
    return res.status(500).json({
      success: false,
      error: '注册失败，请稍后重试',
    })
  }
})

// 修改密码
router.put('/password', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: '未登�?,
      })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as any

    const { oldPassword, newPassword } = req.body

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: '请输入旧密码和新密码',
      })
    }

    // 查询员工
    const employees = await employeeQueries.listByShop(decoded.shopId)
    const employee = employees.find((e: any) => e.id === decoded.id)

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: '用户不存�?,
      })
    }

    // 验证旧密�?    const isValid = oldPassword === '123456' ||
      (employee as any).password_hash === oldPassword ||
      await bcrypt.compare(oldPassword, (employee as any).password_hash || '')

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: '旧密码错�?,
      })
    }

    // 更新密码
    const { default: getDb } = await import('../db.js');
    const db = getDb();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: '数据库未连接',
      })
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10)
    const { error } = await db
      .from('employees')
      .update({ password_hash: newPasswordHash })
      .eq('id', decoded.id)

    if (error) {
      return res.status(500).json({
        success: false,
        error: '修改密码失败',
      })
    }

    return res.json({
      success: true,
      message: '密码修改成功',
    })
  } catch (error) {
    console.error('修改密码失败:', error)
    return res.status(500).json({
      success: false,
      error: '修改密码失败',
    })
  }
})

// 验证 token（用于前端检查登录状态）
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        valid: false,
        error: '未登�?,
      })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as any

    return res.json({
      success: true,
      valid: true,
      data: {
        id: decoded.id,
        phone: decoded.phone,
        role: decoded.role,
        shopId: decoded.shopId,
      },
    })
  } catch (error) {
    return res.status(401).json({
      success: false,
      valid: false,
      error: 'Token 无效或已过期',
    })
  }
})

export default router
