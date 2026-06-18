import { Router, Request, Response } from 'express';
import { mockBookings } from '../_internal/mockData.js';

const router = Router();

// ==================== 财务报表聚合 API ====================

// 聚合类型
type TimeRange = 'day' | 'week' | 'month' | 'year';

// 获取时间范围的开始和结束日期
const getDateRange = (type: TimeRange, date?: string): { start: Date; end: Date } => {
  const refDate = date ? new Date(date) : new Date();
  refDate.setHours(0, 0, 0, 0);

  let start: Date;
  let end: Date;

  switch (type) {
    case 'day':
      start = new Date(refDate);
      end = new Date(refDate);
      end.setDate(end.getDate() + 1);
      break;
    case 'week':
      // 周一作为一周开�?      const dayOfWeek = refDate.getDay() || 7; // 周日返回7
      start = new Date(refDate);
      start.setDate(start.getDate() - dayOfWeek + 1);
      end = new Date(start);
      end.setDate(end.getDate() + 7);
      break;
    case 'month':
      start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
      end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1);
      break;
    case 'year':
      start = new Date(refDate.getFullYear(), 0, 1);
      end = new Date(refDate.getFullYear() + 1, 0, 1);
      break;
    default:
      start = refDate;
      end = new Date(refDate);
      end.setDate(end.getDate() + 1);
  }

  return { start, end };
};

// 获取店铺财务报表
router.get('/shop/:shopId', (req: Request, res: Response) => {
  const { shopId } = req.params;
  const { range = 'month', date } = req.query;

  const timeRange = range as TimeRange;
  const { start, end } = getDateRange(timeRange, date as string);

  // 筛选该店铺已完成的预约
  const shopBookings = mockBookings.filter((b) => {
    const bookingDate = new Date(b.scheduledTime);
    return (
      b.shopId === shopId &&
      b.status === 'completed' &&
      bookingDate >= start &&
      bookingDate < end
    );
  });

  // 聚合统计
  const totalRevenue = shopBookings.reduce((sum, b) => sum + (b.price || 0), 0);
  const totalServices = shopBookings.length;
  const avgOrderValue = totalServices > 0 ? Math.round(totalRevenue / totalServices) : 0;
  
  // 按天聚合
  const dailyData: Record<string, { revenue: number; count: number }> = {};
  
  shopBookings.forEach((b) => {
    const dateKey = new Date(b.scheduledTime).toISOString().split('T')[0];
    if (!dailyData[dateKey]) {
      dailyData[dateKey] = { revenue: 0, count: 0 };
    }
    dailyData[dateKey].revenue += b.price || 0;
    dailyData[dateKey].count += 1;
  });

  // 转换为数组并排序
  const trend = Object.entries(dailyData)
    .map(([date, data]) => ({
      date,
      revenue: data.revenue,
      count: data.count,
      avgValue: data.count > 0 ? Math.round(data.revenue / data.count) : 0,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  res.json({
    success: true,
    data: {
      shopId,
      range: timeRange,
      date: date || new Date().toISOString().split('T')[0],
      startDate: start.toISOString().split('T')[0],
      endDate: new Date(end.getTime() - 1).toISOString().split('T')[0],
      summary: {
        totalRevenue,
        totalServices,
        avgOrderValue,
        peakDay: trend.length > 0 ? trend.reduce((prev, curr) => (curr.revenue > prev.revenue ? curr : prev)).date : null,
        peakRevenue: trend.length > 0 ? Math.max(...trend.map((d) => d.revenue)) : 0,
      },
      trend,
    },
  });
});

// 获取店铺月度对比报表
router.get('/shop/:shopId/compare', (req: Request, res: Response) => {
  const { shopId } = req.params;
  const { compareType = 'month' } = req.query;

  const now = new Date();
  
  // 当前周期
  const currentRange = getDateRange(compareType as TimeRange);
  const currentBookings = mockBookings.filter((b) => {
    const bookingDate = new Date(b.scheduledTime);
    return (
      b.shopId === shopId &&
      b.status === 'completed' &&
      bookingDate >= currentRange.start &&
      bookingDate < currentRange.end
    );
  });

  // 上一个周�?  const prevDate = new Date(now);
  if (compareType === 'month') {
    prevDate.setMonth(prevDate.getMonth() - 1);
  } else if (compareType === 'week') {
    prevDate.setDate(prevDate.getDate() - 7);
  } else if (compareType === 'year') {
    prevDate.setFullYear(prevDate.getFullYear() - 1);
  }
  
  const prevRange = getDateRange(compareType as TimeRange, prevDate.toISOString().split('T')[0]);
  const prevBookings = mockBookings.filter((b) => {
    const bookingDate = new Date(b.scheduledTime);
    return (
      b.shopId === shopId &&
      b.status === 'completed' &&
      bookingDate >= prevRange.start &&
      bookingDate < prevRange.end
    );
  });

  const currentRevenue = currentBookings.reduce((sum, b) => sum + (b.price || 0), 0);
  const currentServices = currentBookings.length;
  
  const prevRevenue = prevBookings.reduce((sum, b) => sum + (b.price || 0), 0);
  const prevServices = prevBookings.length;

  const revenueChange = prevRevenue > 0 ? Math.round(((currentRevenue - prevRevenue) / prevRevenue) * 100) : 0;
  const serviceChange = prevServices > 0 ? Math.round(((currentServices - prevServices) / prevServices) * 100) : 0;

  res.json({
    success: true,
    data: {
      shopId,
      compareType,
      current: {
        period: `${currentRange.start.toLocaleDateString('zh-CN')} - ${new Date(currentRange.end.getTime() - 1).toLocaleDateString('zh-CN')}`,
        revenue: currentRevenue,
        services: currentServices,
        avgOrderValue: currentServices > 0 ? Math.round(currentRevenue / currentServices) : 0,
      },
      previous: {
        period: `${prevRange.start.toLocaleDateString('zh-CN')} - ${new Date(prevRange.end.getTime() - 1).toLocaleDateString('zh-CN')}`,
        revenue: prevRevenue,
        services: prevServices,
        avgOrderValue: prevServices > 0 ? Math.round(prevRevenue / prevServices) : 0,
      },
      change: {
        revenue: revenueChange,
        services: serviceChange,
      },
    },
  });
});

// 获取技师业绩报�?router.get('/stylist/:stylistId', (req: Request, res: Response) => {
  const { stylistId } = req.params;
  const { range = 'month', date } = req.query;

  const timeRange = range as TimeRange;
  const { start, end } = getDateRange(timeRange, date as string);

  // 筛选该技师已完成的预�?  const stylistBookings = mockBookings.filter((b) => {
    const bookingDate = new Date(b.scheduledTime);
    return (
      b.stylistId === stylistId &&
      b.status === 'completed' &&
      bookingDate >= start &&
      bookingDate < end
    );
  });

  const totalRevenue = stylistBookings.reduce((sum, b) => sum + (b.price || 0), 0);
  const totalServices = stylistBookings.length;
  const avgOrderValue = totalServices > 0 ? Math.round(totalRevenue / totalServices) : 0;

  res.json({
    success: true,
    data: {
      stylistId,
      range: timeRange,
      date: date || new Date().toISOString().split('T')[0],
      startDate: start.toISOString().split('T')[0],
      endDate: new Date(end.getTime() - 1).toISOString().split('T')[0],
      summary: {
        totalRevenue,
        totalServices,
        avgOrderValue,
      },
    },
  });
});

// 获取店铺日汇总报�?router.get('/shop/:shopId/daily', (req: Request, res: Response) => {
  const { shopId } = req.params;
  const { days = '7' } = req.query;

  const daysNum = parseInt(days as string, 10);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setDate(start.getDate() - daysNum + 1);
  start.setHours(0, 0, 0, 0);

  // 按天分组统计
  const dailyStats: Record<string, { revenue: number; count: number; avgValue: number }> = {};
  
  // 初始化所有日�?  for (let i = 0; i < daysNum; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const dateKey = date.toISOString().split('T')[0];
    dailyStats[dateKey] = { revenue: 0, count: 0, avgValue: 0 };
  }

  // 统计已完成的预约
  mockBookings.forEach((b) => {
    const bookingDate = new Date(b.scheduledTime);
    if (b.shopId === shopId && b.status === 'completed' && bookingDate >= start && bookingDate <= end) {
      const dateKey = bookingDate.toISOString().split('T')[0];
      if (dailyStats[dateKey]) {
        dailyStats[dateKey].revenue += b.price || 0;
        dailyStats[dateKey].count += 1;
      }
    }
  });

  // 计算客单价并转换为数�?  const result = Object.entries(dailyStats)
    .map(([date, stats]) => ({
      date,
      ...stats,
      avgValue: stats.count > 0 ? Math.round(stats.revenue / stats.count) : 0,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  res.json({
    success: true,
    data: {
      shopId,
      days: daysNum,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      daily: result,
      total: {
        revenue: result.reduce((sum, d) => sum + d.revenue, 0),
        count: result.reduce((sum, d) => sum + d.count, 0),
        avgValue: result.reduce((sum, d) => sum + d.revenue, 0) / result.reduce((sum, d) => sum + d.count, 0) || 0,
      },
    },
  });
});

export default router;
