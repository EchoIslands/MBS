import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Bell, AlertTriangle, CheckCircle, User, Phone, Calendar, ChevronRight,
  Gift, Sparkles, Mail, MessageCircle, Filter
} from 'lucide-react';
import { mockCustomers, mockShops } from '../../../shared/mockData';
import { Customer, MembershipLevel, CustomerTag } from '../../../shared/types';
import ShopLayout from './ShopLayout';

// 根据客户的消费频率 & 距上次到店天数 计算流失风险与预计下次到店
const analyzeCustomer = (c: Customer): { risk: 'low' | 'medium' | 'high'; recommendedMessage: string; daysToNextVisit: number } => {
  const avgDaysBetween = c.visitCount > 1 ? Math.max(30, Math.floor(365 / c.visitCount)) : 60;
  const lastVisit = c.daysSinceLastVisit ?? 0;
  const daysToNextVisit = Math.max(0, avgDaysBetween - lastVisit);

  let risk: 'low' | 'medium' | 'high' = 'low';
  if (lastVisit > avgDaysBetween * 1.5) risk = 'high';
  else if (lastVisit > avgDaysBetween) risk = 'medium';

  let recommendedMessage = `距您上次护理已经${lastVisit}天，我们为您准备了专属护理方案`;
  if (risk === 'high') recommendedMessage = `尊敬的${c.name}，很久没见您了～我们为您准备了专属回归礼包`;
  else if (risk === 'medium') recommendedMessage = `${c.name}，您的发型该打理了，为您预留了${c.servedByStylistIds?.[0] ? '指定发型师' : '专属时段'}`;

  return { risk, recommendedMessage, daysToNextVisit };
};

const levelName = (lv: MembershipLevel) => {
  if (lv === MembershipLevel.STOCKHOLDER) return '股东会员';
  if (lv === MembershipLevel.PREMIUM) return '高级会员';
  return '普通客户';
};

const CustomerRecall: React.FC = () => {
  const [riskFilter, setRiskFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [levelFilter, setLevelFilter] = useState<'all' | MembershipLevel>('all');
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string>('');
  const navigate = useNavigate();

  // 拿当前店铺
  const shop = mockShops.find((s) => s.id === 'shop1') || mockShops[0];
  const stylists = shop?.employees.filter((e) => e.role === 'stylist') || [];

  // 丰富化客户：计算 daysSinceLastVisit、churnRisk 等
  const enriched = useMemo(() => mockCustomers.map((c) => {
    let lastVisit = c.daysSinceLastVisit;
    if (lastVisit === undefined) {
      if (c.lastVisitAt instanceof Date) {
        lastVisit = Math.floor((Date.now() - c.lastVisitAt.getTime()) / 86400000);
      } else {
        lastVisit = 30;
      }
    }
    const { risk, recommendedMessage, daysToNextVisit } = analyzeCustomer({ ...c, daysSinceLastVisit: lastVisit });
    return {
      ...c,
      daysSinceLastVisit: lastVisit,
      churnRisk: risk,
      recommendedMessage,
      daysToNextVisit,
    };
  }), []);

  // 筛选
  const filtered = enriched.filter((c) => {
    if (riskFilter !== 'all' && c.churnRisk !== riskFilter) return false;
    if (levelFilter !== 'all' && c.membershipLevel !== levelFilter) return false;
    return true;
  });

  // 按流失风险与到店天数排序（最紧急在前）
  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      const riskScore = { high: 0, medium: 1, low: 2 } as const;
      if (riskScore[a.churnRisk || 'low'] !== riskScore[b.churnRisk || 'low']) {
        return riskScore[a.churnRisk || 'low'] - riskScore[b.churnRisk || 'low'];
      }
      return (b.daysSinceLastVisit || 0) - (a.daysSinceLastVisit || 0);
    }), [filtered]
  );

  // 统计卡片
  const stats = useMemo(() => {
    const total = enriched.length;
    const high = enriched.filter((c) => c.churnRisk === 'high').length;
    const medium = enriched.filter((c) => c.churnRisk === 'medium').length;
    const premiumCustomers = enriched.filter((c) =>
      c.membershipLevel === MembershipLevel.PREMIUM || c.membershipLevel === MembershipLevel.STOCKHOLDER
    ).length;
    return { total, high, medium, premiumCustomers };
  }, [enriched]);

  const handleSend = (customer: Customer, channel: 'wechat' | 'sms' | 'phone') => {
    const now = new Set(sentIds);
    now.add(customer.id + '-' + channel);
    setSentIds(now);
    const channelName = channel === 'wechat' ? '微信消息' : channel === 'sms' ? '短信' : '电话回访';
    setToast(`已向【${customer.name}】发送${channelName}：召回提醒`);
    setTimeout(() => setToast(''), 2500);
  };

  const riskBadge = (risk?: 'low' | 'medium' | 'high') => {
    if (risk === 'high') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium"><AlertTriangle size={12} />高流失风险</span>;
    }
    if (risk === 'medium') {
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700 font-medium"><Bell size={12} />需关注</span>;
    }
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium"><CheckCircle size={12} />活跃</span>;
  };

  return (
    <ShopLayout title="客户智能召回">
      <div className="max-w-5xl mx-auto">
        {/* 顶部标题与说明 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Sparkles className="text-orange-500" /> 客户智能召回
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            参考优剪 20 天理发周期提醒机制。系统自动分析每位客户的消费频率，标记流失风险，助客服一键触达沉睡客户。
          </p>
        </div>

        {/* 数据概览卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="text-xs text-gray-500 mb-1">客户总数</div>
            <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
            <div className="text-xs text-gray-400 mt-1">当前店铺分析</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-red-100">
            <div className="text-xs text-gray-500 mb-1">高流失风险</div>
            <div className="text-2xl font-bold text-red-600">{stats.high}</div>
            <div className="text-xs text-gray-400 mt-1">急需触达</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-yellow-100">
            <div className="text-xs text-gray-500 mb-1">需关注</div>
            <div className="text-2xl font-bold text-yellow-600">{stats.medium}</div>
            <div className="text-xs text-gray-400 mt-1">可考虑活动通知</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-orange-100">
            <div className="text-xs text-gray-500 mb-1">高级/股东会员</div>
            <div className="text-2xl font-bold text-orange-600">{stats.premiumCustomers}</div>
            <div className="text-xs text-gray-400 mt-1">优先维护</div>
          </div>
        </div>

        {/* 筛选区 */}
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={16} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">快速筛选</span>
          </div>
          <div className="flex flex-wrap gap-4">
            <div>
              <div className="text-xs text-gray-500 mb-2">流失风险</div>
              <div className="flex gap-2 flex-wrap">
                {[
                  { v: 'all', label: '全部' },
                  { v: 'high', label: '高风险' },
                  { v: 'medium', label: '需关注' },
                  { v: 'low', label: '活跃' },
                ].map((item) => (
                  <button
                    key={item.v}
                    onClick={() => setRiskFilter(item.v as any)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                      riskFilter === item.v
                        ? 'bg-orange-500 text-white shadow'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-l border-gray-200 mx-2" />
            <div>
              <div className="text-xs text-gray-500 mb-2">会员等级</div>
              <div className="flex gap-2 flex-wrap">
                {[
                  { v: 'all', label: '全部' },
                  { v: MembershipLevel.STOCKHOLDER, label: '股东会员' },
                  { v: MembershipLevel.PREMIUM, label: '高级会员' },
                  { v: MembershipLevel.REGULAR, label: '普通客户' },
                ].map((item) => (
                  <button
                    key={item.v as string}
                    onClick={() => setLevelFilter(item.v as any)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                      levelFilter === item.v
                        ? 'bg-orange-500 text-white shadow'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 客户列表 */}
        <div className="space-y-3">
          {sorted.map((c) => {
            const isSent = ['wechat', 'sms', 'phone'].some((ch) => sentIds.has(c.id + '-' + ch));
            return (
              <div
                key={c.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {/* 头像 */}
                  <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <User className="text-orange-600" size={24} />
                  </div>

                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800">{c.name}</span>
                      {riskBadge(c.churnRisk as any)}
                      <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-100 rounded-full">{levelName(c.membershipLevel)}</span>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Phone size={13} /> {c.phone}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={13} /> 上次到店：{c.daysSinceLastVisit} 天前
                      </span>
                      <span className="flex items-center gap-1">
                        <Gift size={13} /> 累计消费 ¥{c.totalSpent}
                      </span>
                      <span>到店 {c.visitCount} 次</span>
                    </div>

                    {/* 智能推荐话术 */}
                    <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-100">
                      <div className="text-xs text-orange-600 font-medium mb-1 flex items-center gap-1">
                        <Sparkles size={12} /> AI 推荐召回话术
                      </div>
                      <div className="text-sm text-gray-700">
                        "{c.recommendedMessage}"
                      </div>
                    </div>

                    {/* 最近到店记录简要 */}
                    {c.visitRecords && c.visitRecords.length > 0 && (
                      <div className="mt-2 text-xs text-gray-400">
                        上次服务：{c.visitRecords[0].serviceNames.join('、')} · ¥{c.visitRecords[0].totalAmount}
                      </div>
                    )}
                  </div>

                  {/* 右侧发送按钮 */}
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleSend(c, 'wechat')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-xs rounded-lg transition-colors shadow-sm"
                    >
                      <MessageCircle size={14} />
                      {sentIds.has(c.id + '-wechat') ? '已发微信' : '发微信'}
                    </button>
                    <button
                      onClick={() => handleSend(c, 'sms')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg transition-colors shadow-sm"
                    >
                      <Mail size={14} />
                      {sentIds.has(c.id + '-sms') ? '已发短信' : '发短信'}
                    </button>
                    <button
                      onClick={() => handleSend(c, 'phone')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs rounded-lg transition-colors shadow-sm"
                    >
                      <Phone size={14} />
                      {sentIds.has(c.id + '-phone') ? '已致电' : '电话回访'}
                    </button>
                  </div>
                </div>

                {/* 底部操作 */}
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <div className="text-xs text-gray-400 flex items-center gap-2">
                    <span>到店频率约 {Math.max(30, Math.floor(365 / (c.visitCount || 1)))} 天/次</span>
                    {c.daysToNextVisit != null && c.churnRisk !== 'low' && (
                      <span className="text-red-500">· 预计下次到店时间已过 {c.daysToNextVisit} 天</span>
                    )}
                  </div>
                  <button
                    onClick={() => navigate('/shop/customers')}
                    className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1"
                  >
                    查看客户画像 <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}

          {sorted.length === 0 && (
            <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
              <Users size={40} className="mx-auto text-gray-300 mb-2" />
              <div className="text-sm text-gray-500">当前筛选条件下暂无客户</div>
            </div>
          )}
        </div>

        {/* 底部小贴士 */}
        <div className="mt-8 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl p-5 border border-orange-100">
          <div className="flex items-start gap-3">
            <Sparkles className="text-orange-500 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <div className="font-semibold text-orange-700 mb-1">运营建议</div>
              <div className="text-sm text-gray-600 leading-relaxed space-y-1.5">
                <p>1. 高流失风险客户优先触达，可搭配"老客户回归礼包"（如 ¥50 优惠券）提升到店率。</p>
                <p>2. 高级会员 / 股东会员建议由店长或专属发型师亲自电话回访，效果更佳。</p>
                <p>3. 对"常客"标签客户可在 20 天左右发送一次"该打理啦"的温和提醒。</p>
                <p>4. 短信 / 微信 / 电话三种渠道组合使用，避免同一客户多次打扰引起反感。</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast 提示 */}
      {toast && (
        <div className="fixed top-6 right-6 bg-green-500 text-white px-4 py-2.5 rounded-lg shadow-lg animate-pulse text-sm flex items-center gap-2 z-50">
          <CheckCircle size={16} />
          {toast}
        </div>
      )}
    </ShopLayout>
  );
};

export default CustomerRecall;
