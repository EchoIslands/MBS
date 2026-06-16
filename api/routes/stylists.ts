import { Router, Request, Response } from 'express';
import { mockBookings, mockReviews } from '../../shared/mockData';

const router = Router();

// 从预约数据中提取发型师信息（兼容 barberId/stylistId）
const getStylistName = (stylistId: string): string => {
  const booking = mockBookings.find((b) => b.stylistId === stylistId || (b as any).barberId === stylistId);
  return booking?.stylistName || (booking as any)?.barberName || '未知发型师';
};

// 检查预约是否属于指定发型师（兼容 barberId/stylistId）
const isStylistBooking = (b: any, stylistId: string): boolean => {
  return b.stylistId === stylistId || b.barberId === stylistId;
};

// 获取预约的发型师ID（兼容 barberId/stylistId）
const getBookingStylistId = (b: any): string | undefined => {
  return b.stylistId || b.barberId;
};

// ==================== 发型师业绩 API ====================

router.get('/:stylistId/performance', (req: Request, res: Response) => {
  const { stylistId } = req.params;
  const { range = 'month', date } = req.query;

  const now = date ? new Date(date as string) : new Date();
  let startDate: Date;
  let endDate: Date;

  switch (range) {
    case 'week':
      const dayOfWeek = now.getDay() || 7;
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - dayOfWeek + 1);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear() + 1, 0, 1);
      break;
    default:
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
  }

  const stylistBookings = mockBookings.filter((b) => {
    const bookingDate = new Date(b.scheduledTime);
    return (
      isStylistBooking(b, stylistId) &&
      b.status === 'completed' &&
      bookingDate >= startDate &&
      bookingDate < endDate
    );
  });

  const stylistReviews = mockReviews.filter((r) => r.stylistId === stylistId);
  const avgRating = stylistReviews.length > 0
    ? parseFloat((stylistReviews.reduce((sum, r) => sum + r.rating, 0) / stylistReviews.length).toFixed(1))
    : 0;

  const serviceRating = stylistReviews.length > 0
    ? parseFloat((stylistReviews.reduce((sum, r) => sum + r.serviceRating, 0) / stylistReviews.length).toFixed(1))
    : 0;

  const skillRating = stylistReviews.length > 0
    ? parseFloat((stylistReviews.reduce((sum, r) => sum + r.skillRating, 0) / stylistReviews.length).toFixed(1))
    : 0;

  const totalRevenue = stylistBookings.reduce((sum, b) => sum + (b.price || 0), 0);
  const totalServices = stylistBookings.length;
  const avgOrderValue = totalServices > 0 ? Math.round(totalRevenue / totalServices) : 0;
  const maxRevenue = Math.max(...stylistBookings.map((b) => b.price || 0), 0);

  res.json({
    success: true,
    data: {
      stylistId,
      stylistName: getStylistName(stylistId),
      range,
      date: date || now.toISOString().split('T')[0],
      startDate: startDate.toISOString().split('T')[0],
      endDate: new Date(endDate.getTime() - 1).toISOString().split('T')[0],
      performance: {
        totalRevenue,
        totalServices,
        avgOrderValue,
        maxRevenue,
        reviewCount: stylistReviews.length,
        avgRating,
        serviceRating,
        skillRating,
      },
    },
  });
});

router.get('/:stylistId/services', (req: Request, res: Response) => {
  const { stylistId } = req.params;

  const serviceStats: Record<string, { count: number; revenue: number }> = {};
  
  mockBookings
    .filter((b) => isStylistBooking(b, stylistId) && b.status === 'completed')
    .forEach((b) => {
      const serviceName = b.serviceName || '未知服务';
      if (!serviceStats[serviceName]) {
        serviceStats[serviceName] = { count: 0, revenue: 0 };
      }
      serviceStats[serviceName].count += 1;
      serviceStats[serviceName].revenue += b.price || 0;
    });

  const serviceRanking = Object.entries(serviceStats)
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      revenue: stats.revenue,
      avgPrice: Math.round(stats.revenue / stats.count),
    }))
    .sort((a, b) => b.count - a.count);

  res.json({
    success: true,
    data: {
      stylistId,
      stylistName: getStylistName(stylistId),
      serviceRanking,
      totalServices: serviceRanking.reduce((sum, s) => sum + s.count, 0),
      totalRevenue: serviceRanking.reduce((sum, s) => sum + s.revenue, 0),
    },
  });
});

router.get('/:stylistId/customers', (req: Request, res: Response) => {
  const { stylistId } = req.params;

  const customerIds = [...new Set(
    mockBookings
      .filter((b) => isStylistBooking(b, stylistId) && b.status === 'completed')
      .map((b) => b.customerId)
  )];

  const customerVisits: Record<string, number> = {};
  mockBookings
    .filter((b) => isStylistBooking(b, stylistId) && b.status === 'completed')
    .forEach((b) => {
      customerVisits[b.customerId] = (customerVisits[b.customerId] || 0) + 1;
    });

  const totalVisits = Object.values(customerVisits).length;
  const repeatCustomers = Object.values(customerVisits).filter((v) => v > 1).length;
  const repeatRate = totalVisits > 0 ? Math.round((repeatCustomers / totalVisits) * 100) : 0;

  const totalVisitsCount = Object.values(customerVisits).reduce((sum, v) => sum + v, 0);
  const avgVisits = customerIds.length > 0 ? parseFloat((totalVisitsCount / customerIds.length).toFixed(1)) : 0;

  res.json({
    success: true,
    data: {
      stylistId,
      stylistName: getStylistName(stylistId),
      totalCustomers: customerIds.length,
      totalServices: totalVisitsCount,
      avgVisitsPerCustomer: avgVisits,
      repeatRate,
      maxVisitsByCustomer: Math.max(...Object.values(customerVisits), 0),
    },
  });
});

router.get('/:stylistId/trend', (req: Request, res: Response) => {
  const { stylistId } = req.params;
  const { days = '14' } = req.query;

  const daysNum = parseInt(days as string, 10);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setDate(start.getDate() - daysNum + 1);
  start.setHours(0, 0, 0, 0);

  const dailyStats: Record<string, { revenue: number; count: number }> = {};
  
  for (let i = 0; i < daysNum; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const dateKey = date.toISOString().split('T')[0];
    dailyStats[dateKey] = { revenue: 0, count: 0 };
  }

  mockBookings
    .filter((b) => {
      const bookingDate = new Date(b.scheduledTime);
      return isStylistBooking(b, stylistId) && b.status === 'completed' && bookingDate >= start && bookingDate <= end;
    })
    .forEach((b) => {
      const dateKey = new Date(b.scheduledTime).toISOString().split('T')[0];
      if (dailyStats[dateKey]) {
        dailyStats[dateKey].revenue += b.price || 0;
        dailyStats[dateKey].count += 1;
      }
    });

  const trend = Object.entries(dailyStats)
    .map(([date, stats]) => ({
      date,
      revenue: stats.revenue,
      count: stats.count,
      avgValue: stats.count > 0 ? Math.round(stats.revenue / stats.count) : 0,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  res.json({
    success: true,
    data: {
      stylistId,
      stylistName: getStylistName(stylistId),
      days: daysNum,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
      trend,
      summary: {
        totalRevenue: trend.reduce((sum, d) => sum + d.revenue, 0),
        totalServices: trend.reduce((sum, d) => sum + d.count, 0),
        avgDailyRevenue: daysNum > 0 ? Math.round(trend.reduce((sum, d) => sum + d.revenue, 0) / daysNum) : 0,
      },
    },
  });
});

router.get('/ranking', (req: Request, res: Response) => {
  const { range = 'month' } = req.query;

  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  switch (range) {
    case 'week':
      const dayOfWeek = now.getDay() || 7;
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - dayOfWeek + 1);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear() + 1, 0, 1);
      break;
    default:
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
  }

  const stylistStats: Record<string, { revenue: number; count: number }> = {};
  
  mockBookings
    .filter((b) => {
      const bookingDate = new Date(b.scheduledTime);
      return b.status === 'completed' && bookingDate >= startDate && bookingDate < endDate && getBookingStylistId(b);
    })
    .forEach((b) => {
      const sid = getBookingStylistId(b)!;
      if (!stylistStats[sid]) {
        stylistStats[sid] = { revenue: 0, count: 0 };
      }
      stylistStats[sid].revenue += b.price || 0;
      stylistStats[sid].count += 1;
    });

  const stylistRatings: Record<string, { rating: number; count: number }> = {};
  mockReviews.forEach((r) => {
    if (r.stylistId) {
      if (!stylistRatings[r.stylistId]) {
        stylistRatings[r.stylistId] = { rating: 0, count: 0 };
      }
      stylistRatings[r.stylistId].rating += r.rating;
      stylistRatings[r.stylistId].count += 1;
    }
  });

  const ranking = Object.entries(stylistStats)
    .map(([stylistId, stats]) => {
      const rating = stylistRatings[stylistId];
      return {
        stylistId,
        stylistName: getStylistName(stylistId),
        revenue: stats.revenue,
        count: stats.count,
        avgOrderValue: Math.round(stats.revenue / stats.count),
        avgRating: rating ? parseFloat((rating.rating / rating.count).toFixed(1)) : 0,
        reviewCount: rating?.count || 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  ranking.forEach((item, index) => {
    (item as any).rank = index + 1;
  });

  res.json({
    success: true,
    data: {
      range,
      startDate: startDate.toISOString().split('T')[0],
      endDate: new Date(endDate.getTime() - 1).toISOString().split('T')[0],
      ranking,
      totalRevenue: ranking.reduce((sum, s) => sum + s.revenue, 0),
      totalServices: ranking.reduce((sum, s) => sum + s.count, 0),
    },
  });
});

export default router;
