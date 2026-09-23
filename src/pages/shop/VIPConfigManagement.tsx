import React, { useState, useEffect } from 'react';
import { Save, Crown, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useAppStore } from '../../store';
import { vipConfigApi } from '../../api';
import { PurchaseVIPPlan, PurchaseVIPLevel } from '../../../shared/types';
import { purchaseVIPPlans } from '../../../shared/membershipPlans';

const DEFAULT_SHOP_ID = 'shop1';

const levelLabels: Record<PurchaseVIPLevel, string> = {
  [PurchaseVIPLevel.REGULAR]: '普通用户',
  [PurchaseVIPLevel.BRONZE]: '普卡 VIP',
  [PurchaseVIPLevel.SILVER]: '银卡 VIP',
  [PurchaseVIPLevel.GOLD]: '金卡 VIP',
  [PurchaseVIPLevel.DIAMOND]: '钻石 VIP',
};

const levelColors: Record<PurchaseVIPLevel, string> = {
  [PurchaseVIPLevel.REGULAR]: 'from-gray-400 to-gray-500',
  [PurchaseVIPLevel.BRONZE]: 'from-orange-400 to-orange-500',
  [PurchaseVIPLevel.SILVER]: 'from-blue-400 to-blue-600',
  [PurchaseVIPLevel.GOLD]: 'from-yellow-400 to-yellow-600',
  [PurchaseVIPLevel.DIAMOND]: 'from-purple-500 via-pink-500 to-orange-500',
};

const CUSTOMIZABLE_LEVELS = [
  PurchaseVIPLevel.BRONZE,
  PurchaseVIPLevel.SILVER,
  PurchaseVIPLevel.GOLD,
  PurchaseVIPLevel.DIAMOND,
];

export default function VIPConfigManagement() {
  const { currentShop, currentEmployee } = useAppStore();
  const shopId = currentShop?.id || DEFAULT_SHOP_ID;
  const isCEO = currentEmployee?.role === 'ceo';

  const [plans, setPlans] = useState<Record<PurchaseVIPLevel, PurchaseVIPPlan>>(() => {
    const map = {} as Record<PurchaseVIPLevel, PurchaseVIPPlan>;
    purchaseVIPPlans.forEach((p) => {
      map[p.level] = p;
    });
    return map;
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadConfigs();
  }, [shopId]);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await vipConfigApi.getPurchaseConfigs(shopId);
      if (data && data.length > 0) {
        setPlans((prev) => {
          const next = { ...prev };
          data.forEach((p) => {
            next[p.level] = p;
          });
          return next;
        });
      }
    } catch (err) {
      console.error('加载 VIP 配置失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const updatePlan = (level: PurchaseVIPLevel, field: keyof PurchaseVIPPlan, value: string | number) => {
    setPlans((prev) => ({
      ...prev,
      [level]: {
        ...prev[level],
        [field]: value,
      },
    }));
  };

  const updateBenefits = (level: PurchaseVIPLevel, text: string) => {
    const benefits = text.split('\n').map((s) => s.trim()).filter(Boolean);
    setPlans((prev) => ({
      ...prev,
      [level]: {
        ...prev[level],
        benefits,
      },
    }));
  };

  const handleSave = async () => {
    if (!isCEO) {
      setError('仅 CEO 可修改会员权益配置');
      return;
    }
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const payload = CUSTOMIZABLE_LEVELS.map((level) => plans[level]);
      const saved = await vipConfigApi.updatePurchaseConfigs(shopId, payload);
      if (saved && saved.length > 0) {
        const next = { ...plans };
        saved.forEach((p) => {
          next[p.level] = p;
        });
        setPlans(next);
        setSuccess('会员权益配置已保存');
      } else {
        setError('保存失败，请稍后重试');
      }
    } catch (err) {
      setError('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Crown className="w-6 h-6 text-yellow-600" />
              会员权益配置
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              仅 CEO 可修改，自定义四档购买型 VIP 的权益内容
            </p>
          </div>
          {isCEO && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-colors font-medium"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? '保存中...' : '保存配置'}
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 text-green-700 rounded-xl flex items-center gap-2">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            {success}
          </div>
        )}

        {!isCEO && (
          <div className="mb-4 p-4 bg-yellow-50 text-yellow-700 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            当前账号无权限修改，仅 CEO 可编辑。
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CUSTOMIZABLE_LEVELS.map((level) => {
            const plan = plans[level];
            return (
              <div key={level} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className={`h-2 bg-gradient-to-r ${levelColors[level]}`} />
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">{levelLabels[level]}</h3>
                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                      {plan.period}
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">显示名称</label>
                      <input
                        type="text"
                        value={plan.name}
                        disabled={!isCEO}
                        onChange={(e) => updatePlan(level, 'name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-50"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">价格（元）</label>
                        <input
                          type="number"
                          min={0}
                          value={plan.price}
                          disabled={!isCEO}
                          onChange={(e) => updatePlan(level, 'price', Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">折扣</label>
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.01}
                          value={plan.discount}
                          disabled={!isCEO}
                          onChange={(e) => updatePlan(level, 'discount', Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-50"
                        />
                        <p className="text-xs text-gray-400 mt-1">0.88 = 8.8 折</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">积分倍率</label>
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={plan.pointsRate}
                          disabled={!isCEO}
                          onChange={(e) => updatePlan(level, 'pointsRate', Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-50"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        权益说明（每行一条）
                      </label>
                      <textarea
                        rows={5}
                        value={(plan.benefits || []).join('\n')}
                        disabled={!isCEO}
                        onChange={(e) => updateBenefits(level, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none disabled:bg-gray-50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
