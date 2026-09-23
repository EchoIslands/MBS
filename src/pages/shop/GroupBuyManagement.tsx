import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Ticket,
  Loader2,
  Trash2,
  Edit2,
  X,
  Save,
  CheckCircle,
  Eye,
  Users,
  Hash,
  Clock,
  CreditCard,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { GroupBuyBatch, GroupBuyVoucher, Service } from '../../../shared/types';
import { groupBuyApi, shopApi } from '../../api';
import { purchaseVIPPlans, storedValuePlans } from '../../../shared/membershipPlans';
import ShopLayout from './ShopLayout';

const priceTypeOptions = [
  { value: 'fixed', label: '固定团购价' },
  { value: 'per_service', label: '按服务项目自定义价' },
  { value: 'vip_level', label: '按会员等级折扣价' },
];

const vipLevelOptions = [
  { value: 'regular', label: '普通用户（无折扣）' },
  ...purchaseVIPPlans.filter((p) => p.level !== 'regular').map((p) => ({ value: p.level, label: `${p.name}（${Math.round(p.discount * 100)}折）` })),
  ...storedValuePlans.filter((p) => p.level !== 'none').map((p) => ({ value: p.level, label: `${p.name} ${p.amount}（${Math.round(p.discount * 100)}折）` })),
];

const GroupBuyManagement: React.FC = () => {
  const { currentShop } = useAppStore();
  const [batches, setBatches] = useState<GroupBuyBatch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState<GroupBuyBatch | null>(null);

  const [redeemCode, setRedeemCode] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemResult, setRedeemResult] = useState<{ success: boolean; message: string } | null>(null);

  // 批次详情/预览弹窗
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [viewingBatch, setViewingBatch] = useState<GroupBuyBatch | null>(null);
  const [viewVouchers, setViewVouchers] = useState<GroupBuyVoucher[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewFilter, setViewFilter] = useState<'all' | 'unused' | 'used'>('all');

  const shopId = currentShop?.id || '';

  const loadBatches = useCallback(async () => {
    if (!shopId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [batchData, shopData] = await Promise.all([
        groupBuyApi.getBatches(shopId),
        shopApi.getShop(shopId),
      ]);
      setBatches(Array.isArray(batchData) ? batchData : []);
      setServices(shopData?.services || []);
    } catch (err: unknown) {
      console.error('[GroupBuyManagement] 加载失败:', err);
      alert('加载失败：' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const [formData, setFormData] = useState<Partial<GroupBuyBatch>>({
    name: '',
    serviceIds: [],
    servicePrices: {},
    priceType: 'fixed',
    fixedPrice: 0,
    vipLevel: 'bronze',
    validFrom: new Date(),
    validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    totalQuantity: -1,
    isActive: true,
  });

  const handleAdd = () => {
    setEditingBatch(null);
    setFormData({
      name: '',
      serviceIds: [],
      servicePrices: {},
      priceType: 'fixed',
      fixedPrice: 0,
      vipLevel: 'bronze',
      validFrom: new Date(),
      validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      totalQuantity: -1,
      isActive: true,
    });
    setShowModal(true);
  };

  const handleEdit = (batch: GroupBuyBatch) => {
    setEditingBatch(batch);
    setFormData({
      name: batch.name,
      serviceIds: batch.serviceIds || [],
      servicePrices: batch.servicePrices || {},
      priceType: batch.priceType,
      fixedPrice: batch.fixedPrice,
      vipLevel: batch.vipLevel,
      validFrom: batch.validFrom ? new Date(batch.validFrom) : new Date(),
      validTo: batch.validTo ? new Date(batch.validTo) : new Date(),
      totalQuantity: batch.totalQuantity,
      isActive: batch.isActive,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name || !Array.isArray(formData.serviceIds) || formData.serviceIds.length === 0 || !formData.validTo) {
      alert('请填写名称、服务项目和有效期');
      return;
    }
    if (formData.priceType === 'fixed' && formData.fixedPrice === undefined) {
      alert('请填写固定团购价');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        shopId,
        validFrom: formData.validFrom ? new Date(formData.validFrom).toISOString() : new Date().toISOString(),
        validTo: new Date(formData.validTo).toISOString(),
      } as unknown as Partial<GroupBuyBatch>;
      if (editingBatch) {
        const updated = await groupBuyApi.updateBatch(editingBatch.id, payload);
        if (updated) {
          setBatches(batches.map((b) => (b.id === updated.id ? updated : b)));
          setShowModal(false);
        }
      } else {
        const created = await groupBuyApi.createBatch(payload);
        if (created) {
          setBatches([created, ...batches]);
          setShowModal(false);
        }
      }
    } catch (err: unknown) {
      console.error('[GroupBuyManagement] 保存失败:', err);
      alert('保存失败：' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该团购批次吗？已核销的券码记录将保留。')) return;
    try {
      const ok = await groupBuyApi.deleteBatch(id);
      if (ok) {
        setBatches(batches.filter((b) => b.id !== id));
      } else {
        alert('删除失败');
      }
    } catch (err: unknown) {
      console.error('[GroupBuyManagement] 删除失败:', err);
      alert('删除失败：' + (err as Error).message);
    }
  };

  const handleRedeem = async () => {
    if (!redeemCode.trim()) {
      alert('请输入券码');
      return;
    }
    setRedeemLoading(true);
    setRedeemResult(null);
    try {
      const result = await groupBuyApi.redeemVoucher({ code: redeemCode.trim() });
      if (result?.voucher) {
        setRedeemResult({
          success: true,
          message: `核销成功！券码 ${redeemCode} 已核销，团购价：${result.priceInfo?.description || ''}`,
        });
        setRedeemCode('');
        loadBatches();
      } else {
        setRedeemResult({ success: false, message: '核销失败，请检查券码或批次配置' });
      }
    } catch (err: unknown) {
      setRedeemResult({ success: false, message: (err as Error).message || '核销失败' });
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleView = async (batch: GroupBuyBatch) => {
    setViewingBatch(batch);
    setShowDetailModal(true);
    setViewLoading(true);
    setViewFilter('all');
    try {
      const vouchers = await groupBuyApi.getVouchers(batch.id);
      setViewVouchers(vouchers || []);
    } catch (err: unknown) {
      console.error('[GroupBuyManagement] 加载券码失败:', err);
      alert('加载券码失败：' + (err as Error).message);
      setViewVouchers([]);
    } finally {
      setViewLoading(false);
    }
  };

  const closeDetail = () => {
    setShowDetailModal(false);
    setViewingBatch(null);
    setViewVouchers([]);
    setViewFilter('all');
  };

  const toggleService = (serviceId: string) => {
    setFormData((prev) => {
      const ids = prev.serviceIds || [];
      return {
        ...prev,
        serviceIds: ids.includes(serviceId) ? ids.filter((id) => id !== serviceId) : [...ids, serviceId],
      };
    });
  };

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('zh-CN');
  };

  return (
    <ShopLayout title="外部团购券管理">
      <div className="p-4 max-w-6xl mx-auto">
        {/* 手动核销区域 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Ticket size={20} className="text-orange-500" />
            手动核销
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
              placeholder="输入美团等外部平台券码"
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              onClick={handleRedeem}
              disabled={redeemLoading}
              className="px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {redeemLoading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
              核销
            </button>
          </div>
          {redeemResult && (
            <div
              className={`mt-4 p-3 rounded-xl text-sm ${
                redeemResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {redeemResult.message}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">
            说明：券码首次核销时会自动绑定到已有批次；如未找到对应券码，请先在下方创建团购批次。
          </p>
        </div>

        {/* 批次列表 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-gray-800">团购活动批次</h2>
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium flex items-center gap-2 transition-colors"
            >
              <Plus size={18} />
              新建批次
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={32} className="animate-spin text-blue-500" />
            </div>
          ) : batches.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Ticket size={48} className="mx-auto mb-3 opacity-30" />
              <p>暂无团购批次</p>
            </div>
          ) : (
            <div className="space-y-4">
              {batches.map((batch) => (
                <div
                  key={batch.id}
                  className={`border rounded-xl p-4 transition-colors ${
                    batch.isActive ? 'border-gray-100 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-gray-800">{batch.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        有效期：{formatDate(batch.validFrom)} 至 {formatDate(batch.validTo)}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {batch.serviceIds?.map((sid) => {
                          const service = services.find((s) => s.id === sid);
                          return (
                            <span key={sid} className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded-lg">
                              {service?.name || sid}
                            </span>
                          );
                        })}
                      </div>
                      <p className="text-sm text-orange-600 mt-2">
                        价格类型：
                        {batch.priceType === 'fixed'
                          ? `固定价 ¥${batch.fixedPrice}`
                          : batch.priceType === 'per_service'
                          ? '按服务项目自定义价'
                          : `按${vipLevelOptions.find((o) => o.value === batch.vipLevel)?.label.split('（')[0]}折扣`}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        已核销：{batch.usedQuantity} / {batch.totalQuantity === -1 ? '不限' : batch.totalQuantity}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleView(batch)}
                        title="查看详情"
                        className="p-2 text-gray-500 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        onClick={() => handleEdit(batch)}
                        title="编辑"
                        className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(batch.id)}
                        title="删除"
                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 创建/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-800">
                {editingBatch ? '编辑团购批次' : '新建团购批次'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">批次名称</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="如：美团金秋剪发团购"
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">适用服务项目</label>
                <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-100 rounded-xl p-3">
                  {services.map((service) => (
                    <label key={service.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(formData.serviceIds || []).includes(service.id)}
                        onChange={() => toggleService(service.id)}
                        className="w-4 h-4 text-blue-500 rounded"
                      />
                      <span className="text-sm text-gray-700">
                        {service.name}（¥{service.price}）
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">价格类型</label>
                <select
                  value={formData.priceType}
                  onChange={(e) => setFormData({ ...formData, priceType: e.target.value as GroupBuyBatch['priceType'] })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {priceTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {formData.priceType === 'fixed' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">固定团购价（元）</label>
                  <input
                    type="number"
                    value={formData.fixedPrice || 0}
                    onChange={(e) => setFormData({ ...formData, fixedPrice: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {formData.priceType === 'per_service' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">各服务项目团购价（元）</label>
                  <div className="space-y-2 border border-gray-100 rounded-xl p-3">
                    {services
                      .filter((s) => (formData.serviceIds || []).includes(s.id))
                      .map((service) => (
                        <div key={service.id} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-gray-700 flex-1">{service.name}（原价 ¥{service.price}）</span>
                          <input
                            type="number"
                            value={formData.servicePrices?.[service.id] ?? service.price}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                servicePrices: { ...(prev.servicePrices || {}), [service.id]: Number(e.target.value) },
                              }))
                            }
                            className="w-32 px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                        </div>
                      ))}
                    {(formData.serviceIds || []).length === 0 && (
                      <p className="text-xs text-gray-400">请先选择适用服务项目</p>
                    )}
                  </div>
                </div>
              )}

              {formData.priceType === 'vip_level' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">对应会员等级</label>
                  <select
                    value={formData.vipLevel}
                    onChange={(e) => setFormData({ ...formData, vipLevel: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {vipLevelOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
                  <input
                    type="date"
                    value={formData.validFrom ? new Date(formData.validFrom).toISOString().split('T')[0] : ''}
                    onChange={(e) => setFormData({ ...formData, validFrom: new Date(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
                  <input
                    type="date"
                    value={formData.validTo ? new Date(formData.validTo).toISOString().split('T')[0] : ''}
                    onChange={(e) => setFormData({ ...formData, validTo: new Date(e.target.value) })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">总数量（-1 表示不限）</label>
                <input
                  type="number"
                  value={formData.totalQuantity || 0}
                  onChange={(e) => setFormData({ ...formData, totalQuantity: Number(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-blue-500 rounded"
                />
                <span className="text-sm text-gray-700">启用该批次</span>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 批次详情/预览弹窗 */}
      {showDetailModal && viewingBatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-gray-800">{viewingBatch.name}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  有效期：{formatDate(viewingBatch.validFrom)} 至 {formatDate(viewingBatch.validTo)}
                </p>
              </div>
              <button
                onClick={closeDetail}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {/* 基本信息 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <CreditCard size={14} /> 价格类型
                  </p>
                  <p className="text-sm font-medium text-gray-800">
                    {viewingBatch.priceType === 'fixed'
                      ? `固定价 ¥${viewingBatch.fixedPrice}`
                      : viewingBatch.priceType === 'per_service'
                      ? '按服务项目自定义价'
                      : `按${vipLevelOptions.find((o) => o.value === viewingBatch.vipLevel)?.label.split('（')[0]}折扣`}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <Clock size={14} /> 状态
                  </p>
                  <p className="text-sm font-medium">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                        viewingBatch.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {viewingBatch.isActive ? '启用中' : '已停用'}
                    </span>
                  </p>
                </div>
              </div>

              {/* 适用服务 */}
              <div className="mb-6">
                <p className="text-sm font-medium text-gray-700 mb-2">适用服务项目</p>
                <div className="flex flex-wrap gap-2">
                  {(viewingBatch.serviceIds || []).length === 0 ? (
                    <span className="text-sm text-gray-400">未配置</span>
                  ) : (
                    viewingBatch.serviceIds?.map((sid) => {
                      const service = services.find((s) => s.id === sid);
                      return (
                        <span key={sid} className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded-lg">
                          {service?.name || sid}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 统计 */}
              {(() => {
                const total = viewVouchers.length;
                const used = viewVouchers.filter((v) => v.status === 'used').length;
                const unused = total - used;
                const rate = total > 0 ? Math.round((used / total) * 100) : 0;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <div className="bg-orange-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-orange-600 mb-1 flex items-center justify-center gap-1">
                        <Hash size={14} /> 总券数
                      </p>
                      <p className="text-2xl font-bold text-orange-700">{total}</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-green-600 mb-1">已核销</p>
                      <p className="text-2xl font-bold text-green-700">{used}</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-blue-600 mb-1">未核销</p>
                      <p className="text-2xl font-bold text-blue-700">{unused}</p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-purple-600 mb-1">核销率</p>
                      <p className="text-2xl font-bold text-purple-700">{rate}%</p>
                    </div>
                  </div>
                );
              })()}

              {/* 筛选 */}
              <div className="flex items-center gap-2 mb-4">
                {(['all', 'unused', 'used'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setViewFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      viewFilter === f
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f === 'all' ? '全部' : f === 'unused' ? '未使用' : '已使用'}
                  </button>
                ))}
              </div>

              {/* 券码列表 */}
              {viewLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">券码</th>
                        <th className="text-left px-4 py-3 font-medium">状态</th>
                        <th className="text-left px-4 py-3 font-medium">核销时间</th>
                        <th className="text-left px-4 py-3 font-medium">关联订单</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {viewVouchers
                        .filter((v) => (viewFilter === 'all' ? true : v.status === viewFilter))
                        .slice(0, 50)
                        .map((v) => (
                          <tr key={v.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-gray-800">{v.code}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                                  v.status === 'used'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-orange-100 text-orange-700'
                                }`}
                              >
                                {v.status === 'used' ? '已核销' : '未使用'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {v.usedAt ? formatDate(v.usedAt) : '-'}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {v.usedOrderId || '-'}
                            </td>
                          </tr>
                        ))}
                      {viewVouchers.filter((v) => (viewFilter === 'all' ? true : v.status === viewFilter))
                        .length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">
                            暂无券码记录
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {viewVouchers.filter((v) => (viewFilter === 'all' ? true : v.status === viewFilter)).length > 50 && (
                    <p className="px-4 py-3 text-xs text-gray-400 text-center border-t border-gray-100">
                      仅展示前 50 条，可在筛选中查看不同状态
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end">
              <button
                onClick={closeDetail}
                className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </ShopLayout>
  );
};

export default GroupBuyManagement;
