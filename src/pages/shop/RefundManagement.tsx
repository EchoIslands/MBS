import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, CheckCircle, XCircle, DollarSign, MessageSquare, AlertTriangle, Loader2 } from 'lucide-react';
import { useAppStore } from '../../store';
import { RefundStatus, RefundRequest } from '../../../shared/types';
import { refundApi } from '../../api';
import ShopLayout from './ShopLayout';
import { beijingDateTimeInput, manualPaymentTimeIso } from '../../../shared/lib/manualPaymentTime';
import { settlementDateLabel } from '../../../shared/lib/settlementDisplay';

const RefundManagement: React.FC = () => {
  const { currentShop, currentEmployee } = useAppStore();
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedRefund, setSelectedRefund] = useState<RefundRequest | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [processAction, setProcessAction] = useState<'approve' | 'reject' | 'complete'>('approve');
  const [rejectReason, setRejectReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<'original' | 'balance' | 'bank'>('original');
  const [receiptRef, setReceiptRef] = useState('');
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptAt, setReceiptAt] = useState('');
  const [loadError, setLoadError] = useState('');
  const [processError, setProcessError] = useState('');
  const [loadedScope, setLoadedScope] = useState('');
  const scope = `${currentEmployee?.id || ''}:${currentShop?.id || ''}`;
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const requestSequence = useRef(0);
  const processingRef = useRef(false);

  // 加载店铺退款申请
  const fetchRefunds = useCallback(async () => {
    const request = ++requestSequence.current;
    if (!currentShop?.id) {
      setLoadError('门店信息未加载，请重新登录');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const data = await refundApi.getByShop(currentShop.id);
      if (request !== requestSequence.current || activeScope.current !== scope) return;
      if (!Array.isArray(data)) throw new Error('退款记录返回格式异常，请重新加载');
        setRefunds(
          data.map((r: unknown) => {
            const item = r as Partial<RefundRequest>;
            return {
              ...item,
              createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
              processedAt: item.processedAt ? new Date(item.processedAt) : undefined,
            } as RefundRequest;
          })
        );
        setLoadedScope(scope);
    } catch (err: unknown) {
      if (request !== requestSequence.current || activeScope.current !== scope) return;
      console.error('[RefundManagement] 获取退款申请失败:', (err as Error).message);
      setLoadError((err as Error).message || '退款记录加载失败，请重新加载');
    } finally {
      if (request === requestSequence.current && activeScope.current === scope) setLoading(false);
    }
  }, [currentShop?.id, scope]);

  useEffect(() => {
    const requests = requestSequence;
    setShowProcessModal(false);
    setSelectedRefund(null);
    setProcessError('');
    void fetchRefunds();
    return () => { requests.current++; };
  }, [fetchRefunds]);

  const dataReady = loadedScope === scope && !loading && !loadError;
  const shopRefunds = refunds.filter((r) => r.shopId === currentShop?.id);
  const pendingRefunds = shopRefunds.filter((r) => r.status === RefundStatus.PENDING);
  const processedRefunds = shopRefunds.filter((r) => r.status !== RefundStatus.PENDING);

  const handleProcess = (refund: RefundRequest, action: 'approve' | 'reject' | 'complete') => {
    if (!dataReady || processingRef.current) return;
    setSelectedRefund(refund);
    setProcessAction(action);
    setRefundMethod('original');
    setRejectReason('');
    setReceiptRef('');
    setReceiptAmount(action === 'complete' ? String(refund.amount) : '');
    setReceiptAt(action === 'complete' ? beijingDateTimeInput() : '');
    setProcessError('');
    setShowProcessModal(true);
  };

  const confirmProcess = async () => {
    if (!selectedRefund || processingRef.current || !dataReady) return;
    const actionScope = scope;
    processingRef.current = true;
    setProcessing(true);
    setProcessError('');
    try {
      const status = processAction === 'approve' ? RefundStatus.APPROVED : processAction === 'reject' ? RefundStatus.REJECTED : RefundStatus.COMPLETED;
      const payload: { rejectReason?: string; refundMethod?: string; receiptRef?: string; receiptAmount?: number; receiptAt?: string } = {};
      if (processAction === 'approve') {
        payload.refundMethod = refundMethod;
      } else if (processAction === 'reject') {
        payload.rejectReason = rejectReason;
      } else {
        payload.refundMethod = selectedRefund.refundMethod || refundMethod;
        payload.receiptRef = receiptRef.trim();
        payload.receiptAmount = Number(receiptAmount);
        const actualReceiptTime = manualPaymentTimeIso(receiptAt, Date.now(), '退款发生时间');
        if (!actualReceiptTime) throw new Error('请选择实际退款时间（北京时间）');
        payload.receiptAt = actualReceiptTime;
      }

      const result = await refundApi.updateStatus(selectedRefund.id, status, payload);
      if (activeScope.current !== actionScope) return;
      if (result && result.id === selectedRefund.id && result.status === status) {
        setRefunds(
          previous => previous.map((r) =>
            r.id === selectedRefund.id
              ? {
                  ...r,
                  status: result.status || status,
                  refundMethod: result.refundMethod || refundMethod,
                  rejectReason: result.rejectReason || rejectReason,
                  processedBy: result.processedBy,
                  processedAt: result.processedAt ? new Date(result.processedAt) : undefined,
                  refundReceiptRef: result.refundReceiptRef,
                  refundReceiptAmount: result.refundReceiptAmount,
                  refundReceiptAt: result.refundReceiptAt ? new Date(result.refundReceiptAt) : undefined,
                  refundReceiptRecordedBy: result.refundReceiptRecordedBy,
                  refundReceiptRecordedByName: result.refundReceiptRecordedByName,
                }
              : r
          )
        );
        setShowProcessModal(false);
        setSelectedRefund(null);
        setRejectReason('');
        setReceiptRef(''); setReceiptAmount(''); setReceiptAt('');
      } else {
        throw new Error('退款处理结果未确认，请关闭弹窗并重新加载核对');
      }
    } catch (err: unknown) {
      if (activeScope.current !== actionScope) return;
      console.error('[RefundManagement] 处理退款失败:', (err as Error).message);
      setProcessError('处理退款失败：' + ((err as Error).message || '请重新核对后重试'));
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: RefundStatus) => {
    const configs = {
      [RefundStatus.PENDING]: { icon: Clock, color: 'bg-yellow-100 text-yellow-700', text: '待处理' },
      [RefundStatus.APPROVED]: { icon: CheckCircle, color: 'bg-blue-100 text-blue-700', text: '已批准' },
      [RefundStatus.REJECTED]: { icon: XCircle, color: 'bg-red-100 text-red-700', text: '已拒绝' },
      [RefundStatus.COMPLETED]: { icon: CheckCircle, color: 'bg-green-100 text-green-700', text: '已完成' },
      [RefundStatus.CANCELLED]: { icon: XCircle, color: 'bg-gray-100 text-gray-700', text: '已取消' },
    };
    return configs[status];
  };

  const getPriorityColor = (createdAt: Date) => {
    const hours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
    if (hours > 48) return 'border-l-red-500';
    if (hours > 24) return 'border-l-orange-500';
    return 'border-l-yellow-500';
  };

  return (
    <ShopLayout title="退款管理">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="p-3 rounded-xl bg-amber-50 text-amber-900 text-sm">此页登记退款申请和处理状态。批准申请不会自动退还余额或发起微信、支付宝退款，请在门店实际完成退款后再确认到账情况。</div>
        {/* 统计卡片 */}
        {dataReady && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <Clock size={24} className="text-yellow-500" />
              <span className="text-2xl font-bold text-gray-800">{pendingRefunds.length}</span>
            </div>
            <div className="text-sm text-gray-500">待处理</div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <DollarSign size={24} className="text-orange-500" />
              <span className="text-2xl font-bold text-gray-800">
                ¥{pendingRefunds.reduce((sum, r) => sum + r.amount, 0)}
              </span>
            </div>
            <div className="text-sm text-gray-500">待退款金额</div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle size={24} className="text-green-500" />
              <span className="text-2xl font-bold text-gray-800">{processedRefunds.length}</span>
            </div>
            <div className="text-sm text-gray-500">已处理</div>
          </div>
        </div>}

        {loadError ? (
          <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
            <p>{loadError}</p>
            <button onClick={() => void fetchRefunds()} className="mt-3 px-4 py-2 rounded-lg border border-red-300">重新加载</button>
          </div>
        ) : !dataReady ? (
          <div className="text-center text-gray-500 py-12">
            <Loader2 size={48} className="mx-auto mb-2 opacity-50 animate-spin" />
            <p>加载中...</p>
          </div>
        ) : (
          <>
            {/* 待处理退款 */}
            {pendingRefunds.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <AlertTriangle size={20} className="text-orange-500" />
                  待处理退款申请
                </h2>
                <div className="space-y-4">
                  {pendingRefunds.map((refund) => {
                    const statusConfig = getStatusBadge(refund.status);
                    const StatusIcon = statusConfig.icon;

                    return (
                      <div
                        key={refund.id}
                        className={`border-l-4 ${getPriorityColor(refund.createdAt)} border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="font-medium text-gray-800">{refund.customerName}</div>
                            <div className="text-sm text-gray-500">
                              申请时间：{new Date(refund.createdAt).toLocaleString('zh-CN')}
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
                              <div className="text-sm text-gray-600">退款金额</div>
                              <div className="text-2xl font-bold text-orange-500">¥{refund.amount}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm text-gray-600">原单信息</div>
                              <div className="font-medium text-gray-800 break-all">结算单：{refund.settlementId || '历史申请未关联结算单'}</div>
                              {refund.bookingId && <div className="text-sm text-gray-600 break-all">关联预约：{refund.bookingId}</div>}
                            </div>
                          </div>
                        </div>

                        <div className="bg-red-50 rounded-lg p-3 mb-4">
                          <div className="text-sm font-medium text-red-800 mb-1">退款原因</div>
                          <div className="text-sm text-red-700">{refund.reason}</div>
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={() => handleProcess(refund, 'approve')}
                            className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                          >
                            <CheckCircle size={18} />
                            批准退款
                          </button>
                          <button
                            onClick={() => handleProcess(refund, 'reject')}
                            className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                          >
                            <XCircle size={18} />
                            拒绝退款
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 已处理退款 */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">已处理退款</h2>

              {processedRefunds.length > 0 ? (
                <div className="space-y-4">
                  {processedRefunds.map((refund) => {
                    const statusConfig = getStatusBadge(refund.status);
                    const StatusIcon = statusConfig.icon;

                    return (
                      <div key={refund.id} className="border border-gray-200 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="font-medium text-gray-800">{refund.customerName}</div>
                            <div className="text-sm text-gray-500">
                              处理时间：{refund.processedAt && new Date(refund.processedAt).toLocaleString('zh-CN')}
                            </div>
                            {refund.settlementId && <div className="text-sm text-gray-500 break-all">结算单：{refund.settlementId}</div>}
                          </div>
                          <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${statusConfig.color}`}>
                            <StatusIcon size={16} />
                            {statusConfig.text}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                          <div>
                            <span className="text-gray-500">退款金额：</span>
                            <span className="font-bold text-orange-500">¥{refund.amount}</span>
                          </div>

                          {refund.status === RefundStatus.APPROVED && (
                            <button onClick={() => handleProcess(refund, 'complete')} className="mt-3 w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium">登记实际退款回执并完成</button>
                          )}
                          <div>
                            <span className="text-gray-500">处理人：</span>
                            <span className="text-gray-800">{refund.processedBy}</span>
                          </div>
                        </div>

                        {refund.rejectReason && (
                          <div className="mt-2 text-sm text-red-600">
                            拒绝原因：{refund.rejectReason}
                          </div>
                        )}
                        {refund.refundReceiptRef && (
                          <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-900 space-y-1 break-words">
                            <div>退款回执编号：{refund.refundReceiptRef}</div>
                            <div>实际退款金额：{refund.refundReceiptAmount == null ? '未记录' : `¥${Number(refund.refundReceiptAmount).toFixed(2)}`}</div>
                            <div>实际退款时间（北京时间）：{settlementDateLabel(refund.refundReceiptAt)}</div>
                            <div>回执登记人：{refund.refundReceiptRecordedByName || refund.refundReceiptRecordedBy || '未记录'}</div>
                            <div className="text-xs">门店人工登记回执，请以实际渠道到账为准。</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <MessageSquare size={48} className="mx-auto mb-2 opacity-50" />
                  <p>暂无已处理的退款</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 处理退款弹窗 */}
      {showProcessModal && selectedRefund && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              {processAction === 'approve' ? '批准退款' : processAction === 'reject' ? '拒绝退款' : '登记实际退款回执'}
            </h3>

            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              {selectedRefund.settlementId && <div className="text-sm text-gray-600 break-all mb-2">原结算单：{selectedRefund.settlementId}</div>}
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">顾客</span>
                <span className="font-medium">{selectedRefund.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">退款金额</span>
                <span className="font-bold text-orange-500">¥{selectedRefund.amount}</span>
              </div>
            </div>

            {processAction === 'approve' ? (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  退款方式
                </label>
                <select
                  disabled={processing}
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value as 'original' | 'balance' | 'bank')}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  <option value="original">原路退回</option>
                  <option value="balance">退至账户余额</option>
                  <option value="bank">银行转账</option>
                </select>
              </div>
            ) : processAction === 'reject' ? (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  拒绝原因
                </label>
                <textarea
                  disabled={processing}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="请说明拒绝原因..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                />
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                <div className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">完成退款必须记录实际渠道回执；金额必须与申请金额一致。</div>
                <input disabled={processing} value={receiptRef} onChange={e => setReceiptRef(e.target.value)} placeholder="实际退款回执编号" className="w-full px-4 py-3 border border-gray-300 rounded-xl" />
                <input disabled={processing} type="number" min="0" step="0.01" value={receiptAmount} onChange={e => setReceiptAmount(e.target.value)} placeholder="实际退款金额" className="w-full px-4 py-3 border border-gray-300 rounded-xl" />
                <label htmlFor="refund-receipt-at" className="block text-sm text-gray-700">实际退款时间（北京时间，请按渠道回执核对）</label>
                <input disabled={processing} id="refund-receipt-at" type="datetime-local" value={receiptAt} onChange={e => setReceiptAt(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-xl" />
              </div>
            )}

            {processError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{processError}</p>}
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
                disabled={processing || (processAction === 'reject' && !rejectReason) || (processAction === 'complete' && (!receiptRef.trim() || !receiptAt || !receiptAmount))}
                className={`flex-1 py-3 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                  processAction === 'approve'
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-red-500 hover:bg-red-600'
                } disabled:opacity-50`}
              >
                {processing && <Loader2 size={18} className="animate-spin" />}
                {processAction === 'approve' ? '确认批准' : processAction === 'reject' ? '确认拒绝' : '保存回执并完成'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ShopLayout>
  );
};

export default RefundManagement;
