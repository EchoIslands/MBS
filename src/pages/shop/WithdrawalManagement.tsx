import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, Wallet, MessageSquare, AlertTriangle, Loader2, Banknote } from 'lucide-react';
import { useAppStore } from '../../store';
import { WithdrawalStatus, WithdrawalRequest } from '../../../shared/types';
import { withdrawalApi } from '../../api';
import ShopLayout from './ShopLayout';

const WithdrawalManagement: React.FC = () => {
  const { currentShop } = useAppStore();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selected, setSelected] = useState<WithdrawalRequest | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [processAction, setProcessAction] = useState<'approved' | 'rejected' | 'paid'>('approved');
  const [rejectReason, setRejectReason] = useState('');

  const fetchWithdrawals = async () => {
    if (!currentShop?.id) return;
    setLoading(true);
    try {
      const data = await withdrawalApi.getByShop(currentShop.id);
      if (Array.isArray(data)) {
        setWithdrawals(
          data.map((w: unknown) => {
            const item = w as Partial<WithdrawalRequest>;
            return {
              ...item,
              createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
              updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined,
              paidAt: item.paidAt ? new Date(item.paidAt) : undefined,
            } as WithdrawalRequest;
          })
        );
      }
    } catch (err: unknown) {
      console.error('[WithdrawalManagement] 获取提现申请失败:', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWithdrawals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShop?.id]);

  const shopWithdrawals = withdrawals.filter((w) => w.shopId === currentShop?.id);
  const pendingWithdrawals = shopWithdrawals.filter((w) => w.status === WithdrawalStatus.PENDING);
  const approvedWithdrawals = shopWithdrawals.filter((w) => w.status === WithdrawalStatus.APPROVED);
  const processedWithdrawals = shopWithdrawals.filter(
    (w) => w.status === WithdrawalStatus.PAID || w.status === WithdrawalStatus.REJECTED
  );

  const handleProcess = (withdrawal: WithdrawalRequest, action: 'approved' | 'rejected' | 'paid') => {
    setSelected(withdrawal);
    setProcessAction(action);
    setRejectReason('');
    setShowProcessModal(true);
  };

  const confirmProcess = async () => {
    if (!selected) return;
    setProcessing(true);
    try {
      const payload: { rejectReason?: string } = {};
      if (processAction === 'rejected') {
        payload.rejectReason = rejectReason.trim() || '店铺拒绝提现申请';
      }

      const result = await withdrawalApi.updateStatus(selected.id, processAction, payload);
      if (result) {
        const updated: WithdrawalRequest = {
          ...result,
          createdAt: result.createdAt ? new Date(result.createdAt) : selected.createdAt,
          updatedAt: result.updatedAt ? new Date(result.updatedAt) : new Date(),
          paidAt: result.paidAt ? new Date(result.paidAt) : selected.paidAt,
        };
        setWithdrawals(withdrawals.map((w) => (w.id === selected.id ? updated : w)));
      } else {
        alert('处理提现申请失败，请重试');
      }
    } catch (err: unknown) {
      console.error('[WithdrawalManagement] 处理提现申请失败:', (err as Error).message);
      alert('处理提现申请失败：' + (err as Error).message);
    } finally {
      setProcessing(false);
      setShowProcessModal(false);
      setSelected(null);
      setRejectReason('');
    }
  };

  const getStatusBadge = (status: WithdrawalStatus) => {
    const configs = {
      [WithdrawalStatus.PENDING]: { icon: Clock, color: 'bg-yellow-100 text-yellow-700', text: '待审核' },
      [WithdrawalStatus.APPROVED]: { icon: CheckCircle, color: 'bg-blue-100 text-blue-700', text: '已通过' },
      [WithdrawalStatus.PAID]: { icon: CheckCircle, color: 'bg-green-100 text-green-700', text: '已打款' },
      [WithdrawalStatus.REJECTED]: { icon: XCircle, color: 'bg-red-100 text-red-700', text: '已拒绝' },
    };
    return configs[status];
  };

  const getChannelText = (channel: string) => {
    return channel === 'wechat' ? '微信提现' : '抵扣消费';
  };

  const getPriorityColor = (createdAt: Date) => {
    const hours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
    if (hours > 48) return 'border-l-red-500';
    if (hours > 24) return 'border-l-orange-500';
    return 'border-l-yellow-500';
  };

  return (
    <ShopLayout title="提现管理">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <Clock size={24} className="text-yellow-500" />
              <span className="text-2xl font-bold text-gray-800">{pendingWithdrawals.length}</span>
            </div>
            <div className="text-sm text-gray-500">待审核</div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <Banknote size={24} className="text-blue-500" />
              <span className="text-2xl font-bold text-gray-800">{approvedWithdrawals.length}</span>
            </div>
            <div className="text-sm text-gray-500">待打款</div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <Wallet size={24} className="text-orange-500" />
              <span className="text-2xl font-bold text-gray-800">
                ¥{pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0)}
              </span>
            </div>
            <div className="text-sm text-gray-500">待审核金额</div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle size={24} className="text-green-500" />
              <span className="text-2xl font-bold text-gray-800">{processedWithdrawals.length}</span>
            </div>
            <div className="text-sm text-gray-500">已处理</div>
          </div>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-12">
            <Loader2 size={48} className="mx-auto mb-2 opacity-50 animate-spin" />
            <p>加载中...</p>
          </div>
        ) : (
          <>
            {/* 待审核/待打款 */}
            {(pendingWithdrawals.length > 0 || approvedWithdrawals.length > 0) && (
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <AlertTriangle size={20} className="text-orange-500" />
                  待处理提现申请
                </h2>
                <div className="space-y-4">
                  {[...pendingWithdrawals, ...approvedWithdrawals].map((withdrawal) => {
                    const statusConfig = getStatusBadge(withdrawal.status);
                    const StatusIcon = statusConfig.icon;

                    return (
                      <div
                        key={withdrawal.id}
                        className={`border-l-4 ${getPriorityColor(withdrawal.createdAt)} border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="font-medium text-gray-800">{withdrawal.customerName || '顾客'}</div>
                            <div className="text-sm text-gray-500">{withdrawal.customerPhone || ''}</div>
                            <div className="text-sm text-gray-500">
                              申请时间：{new Date(withdrawal.createdAt).toLocaleString('zh-CN')}
                            </div>
                          </div>
                          <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${statusConfig.color}`}>
                            <StatusIcon size={16} />
                            {statusConfig.text}
                          </div>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-3 mb-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm text-gray-600">提现金额</div>
                              <div className="text-2xl font-bold text-orange-500">¥{withdrawal.amount}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-gray-600">提现方式</div>
                              <div className="font-medium text-gray-800">{getChannelText(withdrawal.channel)}</div>
                            </div>
                          </div>
                        </div>

                        {withdrawal.status === WithdrawalStatus.PENDING && (
                          <div className="flex gap-3">
                            <button
                              onClick={() => handleProcess(withdrawal, 'approved')}
                              className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                            >
                              <CheckCircle size={18} />
                              审核通过
                            </button>
                            <button
                              onClick={() => handleProcess(withdrawal, 'rejected')}
                              className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                            >
                              <XCircle size={18} />
                              拒绝
                            </button>
                          </div>
                        )}

                        {withdrawal.status === WithdrawalStatus.APPROVED && (
                          <button
                            onClick={() => handleProcess(withdrawal, 'paid')}
                            className="w-full py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                          >
                            <Banknote size={18} />
                            标记已打款
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 已处理 */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">已处理提现</h2>

              {processedWithdrawals.length > 0 ? (
                <div className="space-y-4">
                  {processedWithdrawals.map((withdrawal) => {
                    const statusConfig = getStatusBadge(withdrawal.status);
                    const StatusIcon = statusConfig.icon;

                    return (
                      <div key={withdrawal.id} className="border border-gray-200 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="font-medium text-gray-800">{withdrawal.customerName || '顾客'}</div>
                            <div className="text-sm text-gray-500">{withdrawal.customerPhone || ''}</div>
                            <div className="text-sm text-gray-500">
                              申请时间：{new Date(withdrawal.createdAt).toLocaleString('zh-CN')}
                            </div>
                          </div>
                          <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${statusConfig.color}`}>
                            <StatusIcon size={16} />
                            {statusConfig.text}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <div>
                            <span className="text-gray-500">提现金额：</span>
                            <span className="font-bold text-orange-500">¥{withdrawal.amount}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">提现方式：</span>
                            <span className="text-gray-800">{getChannelText(withdrawal.channel)}</span>
                          </div>
                        </div>

                        {withdrawal.paidAt && (
                          <div className="mt-2 text-sm text-gray-500">
                            打款时间：{new Date(withdrawal.paidAt).toLocaleString('zh-CN')}
                            {withdrawal.paidBy && <span className="ml-2">操作人：{withdrawal.paidBy}</span>}
                          </div>
                        )}

                        {withdrawal.rejectReason && (
                          <div className="mt-2 text-sm text-red-600">
                            拒绝原因：{withdrawal.rejectReason}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <MessageSquare size={48} className="mx-auto mb-2 opacity-50" />
                  <p>暂无已处理的提现申请</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 处理弹窗 */}
      {showProcessModal && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              {processAction === 'approved' && '审核通过'}
              {processAction === 'rejected' && '拒绝提现'}
              {processAction === 'paid' && '标记已打款'}
            </h3>

            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">顾客</span>
                <span className="font-medium">{selected.customerName || '顾客'}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">提现金额</span>
                <span className="font-bold text-orange-500">¥{selected.amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">提现方式</span>
                <span className="text-gray-800">{getChannelText(selected.channel)}</span>
              </div>
            </div>

            {processAction === 'rejected' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  拒绝原因
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="请说明拒绝原因..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                />
              </div>
            )}

            {processAction === 'paid' && (
              <div className="mb-4 p-3 bg-yellow-50 rounded-xl text-sm text-yellow-800">
                请确认已通过「商家转账到零钱」完成微信打款，点击确认后将扣减顾客可提现余额。
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowProcessModal(false)}
                disabled={processing}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={confirmProcess}
                disabled={processing || (processAction === 'rejected' && !rejectReason.trim())}
                className={`flex-1 py-3 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                  processAction === 'rejected'
                    ? 'bg-red-500 hover:bg-red-600'
                    : processAction === 'paid'
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-blue-500 hover:bg-blue-600'
                } disabled:opacity-50`}
              >
                {processing && <Loader2 size={18} className="animate-spin" />}
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </ShopLayout>
  );
};

export default WithdrawalManagement;
