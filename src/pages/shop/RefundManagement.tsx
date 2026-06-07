import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle, XCircle, DollarSign, MessageSquare, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../store';
import { mockRefundRequests } from '../../../shared/mockData';
import { RefundStatus, RefundRequest } from '../../../shared/types';

const RefundManagement: React.FC = () => {
  const navigate = useNavigate();
  const { currentShop } = useAppStore();
  const [selectedRefund, setSelectedRefund] = useState<RefundRequest | null>(null);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [processAction, setProcessAction] = useState<'approve' | 'reject'>('approve');
  const [rejectReason, setRejectReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<'original' | 'balance' | 'bank'>('original');

  // 获取店铺的退款申请
  const shopRefunds = mockRefundRequests.filter(r => r.shopId === currentShop?.id);
  const pendingRefunds = shopRefunds.filter(r => r.status === RefundStatus.PENDING);
  const processedRefunds = shopRefunds.filter(r => r.status !== RefundStatus.PENDING);

  const handleProcess = (refund: RefundRequest, action: 'approve' | 'reject') => {
    setSelectedRefund(refund);
    setProcessAction(action);
    setShowProcessModal(true);
  };

  const confirmProcess = () => {
    // 模拟处理退款
    setShowProcessModal(false);
    setSelectedRefund(null);
    setRejectReason('');
  };

  const getStatusBadge = (status: RefundStatus) => {
    const configs = {
      [RefundStatus.PENDING]: { icon: Clock, color: 'bg-yellow-100 text-yellow-700', text: '待处理' },
      [RefundStatus.APPROVED]: { icon: CheckCircle, color: 'bg-blue-100 text-blue-700', text: '已批准' },
      [RefundStatus.REJECTED]: { icon: XCircle, color: 'bg-red-100 text-red-700', text: '已拒绝' },
      [RefundStatus.COMPLETED]: { icon: CheckCircle, color: 'bg-green-100 text-green-700', text: '已完成' },
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/shop')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft size={20} />
            <span>返回</span>
          </button>
          <h1 className="font-semibold text-gray-800">退款管理</h1>
          <div className="w-16"></div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        </div>

        {/* 待处理退款 */}
        {pendingRefunds.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <AlertTriangle size={20} className="text-orange-500" />
              待处理退款申请
            </h2>
            <div className="space-y-4">
              {pendingRefunds.map(refund => {
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
                          <div className="text-sm text-gray-600">预约服务</div>
                          <div className="font-medium text-gray-800">精剪服务</div>
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
              {processedRefunds.map(refund => {
                const statusConfig = getStatusBadge(refund.status);
                const StatusIcon = statusConfig.icon;
                
                return (
                  <div
                    key={refund.id}
                    className="border border-gray-200 rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-medium text-gray-800">{refund.customerName}</div>
                        <div className="text-sm text-gray-500">
                          处理时间：{refund.processedAt && new Date(refund.processedAt).toLocaleString('zh-CN')}
                        </div>
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
      </div>

      {/* 处理退款弹窗 */}
      {showProcessModal && selectedRefund && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              {processAction === 'approve' ? '批准退款' : '拒绝退款'}
            </h3>
            
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
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
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value as any)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  <option value="original">原路退回</option>
                  <option value="balance">退至账户余额</option>
                  <option value="bank">银行转账</option>
                </select>
              </div>
            ) : (
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

            <div className="flex gap-3">
              <button
                onClick={() => setShowProcessModal(false)}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmProcess}
                className={`flex-1 py-3 text-white rounded-xl font-medium transition-colors ${
                  processAction === 'approve' 
                    ? 'bg-green-500 hover:bg-green-600' 
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                确认{processAction === 'approve' ? '批准' : '拒绝'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RefundManagement;
