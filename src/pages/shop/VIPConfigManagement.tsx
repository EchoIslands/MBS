import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Save, Crown, Loader2, AlertCircle, CheckCircle, CreditCard, Shield, ArrowLeft, Plus, Trash2, Edit3, X,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { vipConfigApi } from '../../api';
import {
  PurchaseVIPPlan, PurchaseVIPLevel, StoredValuePlan, StoredValueLevel, SpecialVIPConfig,
} from '../../../shared/types';
import { purchaseVIPPlans, storedValuePlans } from '../../../shared/membershipPlans';

const DEFAULT_SHOP_ID = 'shop1';

type TabType = 'purchase' | 'stored' | 'special';

const purchaseLevelLabels: Record<PurchaseVIPLevel, string> = {
  [PurchaseVIPLevel.REGULAR]: '普通用户',
  [PurchaseVIPLevel.BRONZE]: '普卡 VIP',
  [PurchaseVIPLevel.SILVER]: '银卡 VIP',
  [PurchaseVIPLevel.GOLD]: '金卡 VIP',
  [PurchaseVIPLevel.DIAMOND]: '钻石 VIP',
};

const purchaseLevelColors: Record<PurchaseVIPLevel, string> = {
  [PurchaseVIPLevel.REGULAR]: 'from-gray-400 to-gray-500',
  [PurchaseVIPLevel.BRONZE]: 'from-orange-400 to-orange-500',
  [PurchaseVIPLevel.SILVER]: 'from-blue-400 to-blue-600',
  [PurchaseVIPLevel.GOLD]: 'from-yellow-400 to-yellow-600',
  [PurchaseVIPLevel.DIAMOND]: 'from-purple-500 via-pink-500 to-orange-500',
};

const storedLevelLabels: Record<StoredValueLevel, string> = {
  [StoredValueLevel.NONE]: '未储值',
  [StoredValueLevel.STORE_500]: '储值卡',
  [StoredValueLevel.STORE_1000]: '安心卡',
  [StoredValueLevel.STORE_2000]: '顺心卡',
  [StoredValueLevel.STORE_5000]: '随心卡',
};

const storedLevelColors: Record<StoredValueLevel, string> = {
  [StoredValueLevel.NONE]: 'from-gray-400 to-gray-500',
  [StoredValueLevel.STORE_500]: 'from-green-400 to-green-600',
  [StoredValueLevel.STORE_1000]: 'from-cyan-400 to-cyan-600',
  [StoredValueLevel.STORE_2000]: 'from-indigo-400 to-indigo-600',
  [StoredValueLevel.STORE_5000]: 'from-red-400 to-red-600',
};

const CUSTOMIZABLE_PURCHASE_LEVELS = [
  PurchaseVIPLevel.BRONZE,
  PurchaseVIPLevel.SILVER,
  PurchaseVIPLevel.GOLD,
  PurchaseVIPLevel.DIAMOND,
];

const CUSTOMIZABLE_STORED_LEVELS = [
  StoredValueLevel.STORE_500,
  StoredValueLevel.STORE_1000,
  StoredValueLevel.STORE_2000,
  StoredValueLevel.STORE_5000,
];

const EMPTY_SPECIAL: SpecialVIPConfig = {
  key: '',
  name: '',
  discount: 1,
  pointsRate: 1,
  benefits: [],
  color: 'gray',
};

export default function VIPConfigManagement() {
  const navigate = useNavigate();
  const { currentShop, currentEmployee } = useAppStore();
  const shopId = currentShop?.id || DEFAULT_SHOP_ID;
  const isCEO = currentEmployee?.role === 'ceo';

  const [activeTab, setActiveTab] = useState<TabType>('purchase');

  const [purchasePlans, setPurchasePlans] = useState<Record<PurchaseVIPLevel, PurchaseVIPPlan>>(() => {
    const map = {} as Record<PurchaseVIPLevel, PurchaseVIPPlan>;
    purchaseVIPPlans.forEach((p) => {
      map[p.level] = p;
    });
    return map;
  });

  const [storedPlans, setStoredPlans] = useState<Record<StoredValueLevel, StoredValuePlan>>(() => {
    const map = {} as Record<StoredValueLevel, StoredValuePlan>;
    storedValuePlans.forEach((p) => {
      map[p.level] = p;
    });
    return map;
  });

  const [specialConfigs, setSpecialConfigs] = useState<SpecialVIPConfig[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [specialModalOpen, setSpecialModalOpen] = useState(false);
  const [editingSpecial, setEditingSpecial] = useState<SpecialVIPConfig | null>(null);

  useEffect(() => {
    loadConfigs();
  }, [shopId]);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      setError('');
      const [purchaseData, storedData, specialData] = await Promise.all([
        vipConfigApi.getPurchaseConfigs(shopId).catch(() => []),
        vipConfigApi.getStoredConfigs(shopId).catch(() => []),
        vipConfigApi.getSpecialConfigs(shopId).catch(() => []),
      ]);
      if (purchaseData && purchaseData.length > 0) {
        setPurchasePlans((prev) => {
          const next = { ...prev };
          purchaseData.forEach((p) => {
            next[p.level] = p;
          });
          return next;
        });
      }
      if (storedData && storedData.length > 0) {
        setStoredPlans((prev) => {
          const next = { ...prev };
          storedData.forEach((p) => {
            next[p.level] = p;
          });
          return next;
        });
      }
      setSpecialConfigs(specialData || []);
    } catch (err) {
      console.error('加载会员权益配置失败:', err);
    } finally {
      setLoading(false);
    }
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

      let saved: PurchaseVIPPlan[] | StoredValuePlan[] = [];
      if (activeTab === 'purchase') {
        const payload = CUSTOMIZABLE_PURCHASE_LEVELS.map((level) => purchasePlans[level]);
        saved = await vipConfigApi.updatePurchaseConfigs(shopId, payload);
        if (saved && saved.length > 0) {
          const next = { ...purchasePlans };
          saved.forEach((p) => {
            next[p.level] = p as PurchaseVIPPlan;
          });
          setPurchasePlans(next);
        }
      } else if (activeTab === 'stored') {
        const payload = CUSTOMIZABLE_STORED_LEVELS.map((level) => storedPlans[level]);
        saved = await vipConfigApi.updateStoredConfigs(shopId, payload);
        if (saved && saved.length > 0) {
          const next = { ...storedPlans };
          saved.forEach((p) => {
            next[p.level] = p as StoredValuePlan;
          });
          setStoredPlans(next);
        }
      }

      if (saved && saved.length > 0) {
        setSuccess('会员权益配置已保存');
      } else {
        setError('保存失败，请检查数据库表是否已创建');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSpecial = async (config: SpecialVIPConfig) => {
    if (!isCEO) return;
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const saved = await vipConfigApi.saveSpecialConfig(shopId, config);
      if (saved && saved.length > 0) {
        setSpecialConfigs(saved);
        setSpecialModalOpen(false);
        setEditingSpecial(null);
        setSuccess('特殊 VIP 已保存');
      } else {
        setError('保存特殊 VIP 失败，请检查数据库表是否已创建');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSpecial = async (key: string) => {
    if (!isCEO) return;
    if (!window.confirm('确定删除该特殊 VIP 配置吗？')) return;
    try {
      setSaving(true);
      setError('');
      const ok = await vipConfigApi.deleteSpecialConfig(shopId, key);
      if (ok) {
        setSpecialConfigs((prev) => prev.filter((c) => c.key !== key));
        setSuccess('已删除');
      } else {
        setError('删除失败');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSaving(false);
    }
  };

  const openSpecialModal = (config?: SpecialVIPConfig) => {
    setEditingSpecial(config ? { ...config } : { ...EMPTY_SPECIAL, key: `special_${Date.now()}` });
    setSpecialModalOpen(true);
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/shop/manage')}
              className="p-2 rounded-xl hover:bg-gray-200 transition-colors"
              title="返回"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Crown className="w-6 h-6 text-yellow-600" />
                会员权益配置
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                仅 CEO 可修改，自定义购买型 VIP、储值会员与 CEO 专用特殊 VIP
              </p>
            </div>
          </div>
          {(activeTab === 'purchase' || activeTab === 'stored') && isCEO && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-colors font-medium"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? '保存中...' : '保存当前配置'}
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveTab('purchase')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'purchase'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <Crown className="w-4 h-4" />
            购买型 VIP
          </button>
          <button
            onClick={() => setActiveTab('stored')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'stored'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            储值会员
          </button>
          <button
            onClick={() => setActiveTab('special')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'special'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            特殊 VIP（CEO 专用）
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1">{error}</div>
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

        {activeTab === 'purchase' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {CUSTOMIZABLE_PURCHASE_LEVELS.map((level) => (
              <PlanCard
                key={level}
                title={purchaseLevelLabels[level]}
                color={purchaseLevelColors[level]}
                periodLabel="有效期"
                periodValue={purchasePlans[level].period}
                isCEO={isCEO}
                fields={[
                  { label: '显示名称', type: 'text', value: purchasePlans[level].name, onChange: (v) => updatePurchase(level, 'name', v) },
                  { label: '价格（元）', type: 'number', value: purchasePlans[level].price, onChange: (v) => updatePurchase(level, 'price', Number(v)) },
                  { label: '折扣', type: 'number', value: purchasePlans[level].discount, step: 0.01, max: 1, hint: '0.88 = 8.8 折', onChange: (v) => updatePurchase(level, 'discount', Number(v)) },
                  { label: '积分倍率', type: 'number', value: purchasePlans[level].pointsRate, step: 0.1, onChange: (v) => updatePurchase(level, 'pointsRate', Number(v)) },
                ]}
                benefits={purchasePlans[level].benefits || []}
                onBenefitsChange={(text) => updatePurchaseBenefits(level, text)}
              />
            ))}
          </div>
        )}

        {activeTab === 'stored' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {CUSTOMIZABLE_STORED_LEVELS.map((level) => (
              <PlanCard
                key={level}
                title={storedLevelLabels[level]}
                color={storedLevelColors[level]}
                periodLabel="储值金额"
                periodValue={`¥${storedPlans[level].amount}`}
                isCEO={isCEO}
                fields={[
                  { label: '显示名称', type: 'text', value: storedPlans[level].name, onChange: (v) => updateStored(level, 'name', v) },
                  { label: '储值金额（元）', type: 'number', value: storedPlans[level].amount, onChange: (v) => updateStored(level, 'amount', Number(v)) },
                  { label: '折扣', type: 'number', value: storedPlans[level].discount, step: 0.01, max: 1, hint: '0.90 = 9 折', onChange: (v) => updateStored(level, 'discount', Number(v)) },
                  { label: '积分倍率', type: 'number', value: storedPlans[level].pointsRate, step: 0.1, onChange: (v) => updateStored(level, 'pointsRate', Number(v)) },
                ]}
                benefits={storedPlans[level].benefits || []}
                onBenefitsChange={(text) => updateStoredBenefits(level, text)}
              />
            ))}
          </div>
        )}

        {activeTab === 'special' && (
          <div>
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 mb-6 flex items-start gap-3">
              <Shield className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-purple-800">
                <p className="font-medium">特殊 VIP 仅 CEO 可见、可配置</p>
                <p className="mt-1">普通顾客端不会显示特殊 VIP。CEO 可在此创建临时或高级特殊用户模板，后续在顾客管理中手动指定给特定顾客。</p>
              </div>
            </div>

            {isCEO && (
              <button
                onClick={() => openSpecialModal()}
                className="mb-6 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                新增特殊 VIP
              </button>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {specialConfigs.length === 0 ? (
                <div className="col-span-full text-center py-12 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
                  暂无特殊 VIP 配置
                </div>
              ) : (
                specialConfigs.map((config) => (
                  <div key={config.key} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="h-2 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500" />
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900">{config.name || '未命名'}</h3>
                        {isCEO && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => openSpecialModal(config)}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteSpecial(config.key)}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="text-gray-500">折扣</div>
                          <div className="font-semibold text-gray-900">{config.discount}</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="text-gray-500">积分倍率</div>
                          <div className="font-semibold text-gray-900">{config.pointsRate}</div>
                        </div>
                      </div>

                      <div>
                        <div className="text-sm text-gray-500 mb-2">权益说明</div>
                        <ul className="space-y-1">
                          {(config.benefits || []).map((b, i) => (
                            <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                              <span className="w-1 h-1 rounded-full bg-purple-500 mt-2 flex-shrink-0" />
                              {b}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {specialModalOpen && editingSpecial && (
        <SpecialVIPModal
          config={editingSpecial}
          onClose={() => {
            setSpecialModalOpen(false);
            setEditingSpecial(null);
          }}
          onSave={handleSaveSpecial}
          saving={saving}
        />
      )}
    </div>
  );

  function updatePurchase(level: PurchaseVIPLevel, field: keyof PurchaseVIPPlan, value: string | number) {
    setPurchasePlans((prev) => ({
      ...prev,
      [level]: { ...prev[level], [field]: value },
    }));
  }

  function updatePurchaseBenefits(level: PurchaseVIPLevel, text: string) {
    const benefits = text.split('\n').map((s) => s.trim()).filter(Boolean);
    setPurchasePlans((prev) => ({
      ...prev,
      [level]: { ...prev[level], benefits },
    }));
  }

  function updateStored(level: StoredValueLevel, field: keyof StoredValuePlan, value: string | number) {
    setStoredPlans((prev) => ({
      ...prev,
      [level]: { ...prev[level], [field]: value },
    }));
  }

  function updateStoredBenefits(level: StoredValueLevel, text: string) {
    const benefits = text.split('\n').map((s) => s.trim()).filter(Boolean);
    setStoredPlans((prev) => ({
      ...prev,
      [level]: { ...prev[level], benefits },
    }));
  }
}

interface FieldDef {
  label: string;
  type: 'text' | 'number';
  value: string | number;
  step?: number;
  max?: number;
  hint?: string;
  onChange: (value: string) => void;
}

interface PlanCardProps {
  title: string;
  color: string;
  periodLabel: string;
  periodValue: string;
  fields: FieldDef[];
  benefits: string[];
  onBenefitsChange: (text: string) => void;
  isCEO: boolean;
}

function PlanCard({ title, color, periodLabel, periodValue, fields, benefits, onBenefitsChange, isCEO }: PlanCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      <div className={`h-2 bg-gradient-to-r ${color}`} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
            {periodLabel}：{periodValue}
          </span>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fields.map((field) => (
              <div key={field.label} className={field.type === 'text' ? 'sm:col-span-2' : ''}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                <input
                  type={field.type}
                  min={0}
                  max={field.max}
                  step={field.step}
                  value={field.value}
                  disabled={!isCEO}
                  onChange={(e) => field.onChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-50"
                />
                {field.hint && <p className="text-xs text-gray-400 mt-1">{field.hint}</p>}
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              权益说明（每行一条）
            </label>
            <textarea
              rows={5}
              value={benefits.join('\n')}
              disabled={!isCEO}
              onChange={(e) => onBenefitsChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none disabled:bg-gray-50"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface SpecialVIPModalProps {
  config: SpecialVIPConfig;
  onClose: () => void;
  onSave: (config: SpecialVIPConfig) => void;
  saving: boolean;
}

function SpecialVIPModal({ config, onClose, onSave, saving }: SpecialVIPModalProps) {
  const [form, setForm] = useState<SpecialVIPConfig>({ ...config });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">
            {config.name ? '编辑特殊 VIP' : '新增特殊 VIP'}
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">显示名称</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="如：黑卡至尊"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">折扣</label>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">0.50 = 5 折</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">积分倍率</label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={form.pointsRate}
                onChange={(e) => setForm({ ...form, pointsRate: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">权益说明（每行一条）</label>
            <textarea
              rows={5}
              value={(form.benefits || []).join('\n')}
              onChange={(e) => {
                const benefits = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
                setForm({ ...form, benefits });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.name.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
