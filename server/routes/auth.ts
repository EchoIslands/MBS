/**
 * 璁よ瘉 API 璺敱
 * POST /api/auth/login - 鍛樺伐鐧诲綍
 * POST /api/auth/register - 鍛樺伐娉ㄥ唽锛堝彲閫夛級
 * GET /api/auth/me - 鑾峰彇褰撳墠鐢ㄦ埛淇℃伅
 */
import { Router, type Request, type Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { employeeQueries } from '../db/index.js'
import { mockShops, stylistPasswords, managerPasswords, ceoPasswords, csPasswords, shopPasswords } from '../_internal/mockData.js'

const router = Router()

// JWT 瀵嗛挜锛堢敓浜х幆澧冨簲浠庣幆澧冨彉閲忚鍙栵級
const JWT_SECRET = process.env.JWT_SECRET || 'mbs-secret-key-2024'
const JWT_EXPIRES_IN = '7d'

// 鏍规嵁瑙掕壊鑾峰彇瀵嗙爜鏄犲皠
const getPasswordMap = (role?: string): Record<string, string> => {
  switch (role) {
    case 'ceo': return ceoPasswords
    case 'customer_service': return csPasswords
    case 'shop_manager': return managerPasswords
    case 'stylist': return stylistPasswords
    default: return { ...stylistPasswords, ...managerPasswords, ...ceoPasswords, ...csPasswords }
  }
}

// 浠?mock 鏁版嵁涓煡鎵惧憳宸?const findMockEmployee = (phone: string) => {
  for (const shop of mockShops) {
    const employee = shop.employees.find(e => (e as any).phone === phone)
    if (employee) {
      return { ...employee, shopId: shop.id }
    }
  }
  return null
}

// 楠岃瘉 mock 瀵嗙爜
const verifyMockPassword = (employeeId: string, password: string, role?: string): boolean => {
  if (password !== '123456') return false
  const passwords = getPasswordMap(role)
  return passwords[employeeId] === '123456' || true // 榛樿 123456 閮藉彲浠ョ櫥褰?}

// 鐧诲綍
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body

    // 楠岃瘉蹇呭～瀛楁
    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        error: '璇疯緭鍏ユ墜鏈哄彿鍜屽瘑鐮?,
      })
    }

    // 鍏堝皾璇曚粠鏁版嵁搴撴煡璇?    const dbEmployee = await employeeQueries.getByPhone(phone)
    
    let employee = dbEmployee
    let isFromDb = true
    
    // 濡傛灉鏁版嵁搴撴病鏈夛紝灏濊瘯 mock 鏁版嵁
    if (!employee) {
      employee = findMockEmployee(phone) as any
      isFromDb = false
    }
    
    if (!employee) {
      return res.status(401).json({
        success: false,
        error: '鎵嬫満鍙锋垨瀵嗙爜閿欒',
      })
    }

    // 楠岃瘉瀵嗙爜
    let isValidPassword = false
    
    if (isFromDb) {
      // 鏁版嵁搴撴ā寮忥細鏀寔 bcrypt 鍔犲瘑瀵嗙爜鎴栨槑鏂?123456
      isValidPassword = password === '123456' ||
        (employee as any).password_hash === password ||
        await bcrypt.compare(password, (employee as any).password_hash || '')
    } else {
      // Mock 妯″紡锛氶粯璁ゅ瘑鐮?123456
      isValidPassword = verifyMockPassword(employee.id, password, (employee as any).role)
    }

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: '鎵嬫満鍙锋垨瀵嗙爜閿欒',
      })
    }

    // 妫€鏌ュ憳宸ユ槸鍚﹀湪鑱?    if ((employee as any).is_active === false) {
      return res.status(403).json({
        success: false,
        error: '璇ヨ处鍙峰凡琚鐢?,
      })
    }

    // 鐢熸垚 JWT token
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

    // 杩斿洖鐧诲綍鎴愬姛淇℃伅
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
    console.error('鐧诲綍澶辫触:', error)
    return res.status(500).json({
      success: false,
      error: '鐧诲綍澶辫触锛岃绋嶅悗閲嶈瘯',
    })
  }
})

// 鑾峰彇褰撳墠鐢ㄦ埛淇℃伅锛堥渶瑕?token锛?router.get('/me', async (req: Request, res: Response) => {
  try {
    // 浠?header 鑾峰彇 token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: '鏈櫥褰曪紝璇峰厛鐧诲綍',
      })
    }

    const token = authHeader.substring(7)

    // 楠岃瘉 token
    const decoded = jwt.verify(token, JWT_SECRET) as any
    console.log('[auth/me] decoded:', decoded)

    // 鍏堝皾璇曚粠鏁版嵁搴撴煡璇?    let employee = null
    if (decoded.shopId) {
      const employees = await employeeQueries.listByShop(decoded.shopId)
      employee = employees.find((e: any) => e.id === decoded.id)
    }
    
    // 濡傛灉鏁版嵁搴撴病鏈夛紝灏濊瘯鏍规嵁鎵嬫満鍙锋煡鎵?mock 鏁版嵁
    if (!employee && decoded.phone) {
      const mockEmployee = findMockEmployee(decoded.phone)
      if (mockEmployee && (mockEmployee as any).id === decoded.id) {
        employee = mockEmployee
      }
    }

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: '鐢ㄦ埛涓嶅瓨鍦?,
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
        error: 'Token 鏃犳晥',
      })
    }
    if ((error as any).name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token 宸茶繃鏈燂紝璇烽噸鏂扮櫥褰?,
      })
    }
    console.error('鑾峰彇鐢ㄦ埛淇℃伅澶辫触:', error)
    return res.status(500).json({
      success: false,
      error: '鑾峰彇鐢ㄦ埛淇℃伅澶辫触',
    })
  }
})

// 娉ㄥ唽锛堟紨绀虹敤锛岀敓浜х幆澧冨簲鍏抽棴锛?router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, phone, password, role, shopId, title, specialty } = req.body

    // 楠岃瘉蹇呭～瀛楁
    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        error: '璇峰～鍐欏畬鏁翠俊鎭?,
      })
    }

    // 妫€鏌ユ墜鏈哄彿鏄惁宸插瓨鍦?    const existingEmployee = await employeeQueries.getByPhone(phone)
    if (existingEmployee) {
      return res.status(400).json({
        success: false,
        error: '璇ユ墜鏈哄彿宸叉敞鍐?,
      })
    }

    // 鐢熸垚 ID
    const id = `emp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 鍔犲瘑瀵嗙爜
    const passwordHash = await bcrypt.hash(password, 10)

    // 鍒涘缓鍛樺伐锛堣繖閲岄渶瑕佺洿鎺ュ湪鏁版嵁搴撴彃鍏ワ級
    const { default: getDb } = await import('../db.js');
    const db = getDb();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: '鏁版嵁搴撴湭杩炴帴',
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
      console.error('娉ㄥ唽澶辫触:', error)
      return res.status(500).json({
        success: false,
        error: '娉ㄥ唽澶辫触',
      })
    }

    // 鐢熸垚 token
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
    console.error('娉ㄥ唽澶辫触:', error)
    return res.status(500).json({
      success: false,
      error: '娉ㄥ唽澶辫触锛岃绋嶅悗閲嶈瘯',
    })
  }
})

// 淇敼瀵嗙爜
router.put('/password', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: '鏈櫥褰?,
      })
    }

    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as any

    const { oldPassword, newPassword } = req.body

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: '璇疯緭鍏ユ棫瀵嗙爜鍜屾柊瀵嗙爜',
      })
    }

    // 鏌ヨ鍛樺伐
    const employees = await employeeQueries.listByShop(decoded.shopId)
    const employee = employees.find((e: any) => e.id === decoded.id)

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: '鐢ㄦ埛涓嶅瓨鍦?,
      })
    }

    // 楠岃瘉鏃у瘑鐮?    const isValid = oldPassword === '123456' ||
      (employee as any).password_hash === oldPassword ||
      await bcrypt.compare(oldPassword, (employee as any).password_hash || '')

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: '鏃у瘑鐮侀敊璇?,
      })
    }

    // 鏇存柊瀵嗙爜
    const { default: getDb } = await import('../db.js');
    const db = getDb();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: '鏁版嵁搴撴湭杩炴帴',
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
        error: '淇敼瀵嗙爜澶辫触',
      })
    }

    return res.json({
      success: true,
      message: '瀵嗙爜淇敼鎴愬姛',
    })
  } catch (error) {
    console.error('淇敼瀵嗙爜澶辫触:', error)
    return res.status(500).json({
      success: false,
      error: '淇敼瀵嗙爜澶辫触',
    })
  }
})

// 楠岃瘉 token锛堢敤浜庡墠绔鏌ョ櫥褰曠姸鎬侊級
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        valid: false,
        error: '鏈櫥褰?,
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
      error: 'Token 鏃犳晥鎴栧凡杩囨湡',
    })
  }
})

export default router

