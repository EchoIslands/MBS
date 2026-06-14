import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle, Clock, CheckCircle, XCircle, MessageSquare } from 'lucide-react';
import { useAppStore } from '../../store';
import { mockRefundRequests, mockBookings } from '../../../shared/mockData';
import { RefundStatus } from '../../../shared/types';

const RefundPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentCustomer } = useAppStore();
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState('');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // 获取顾客的退款记录
  const customerRefunds = mockRefundRequests.filter(
    r => r.customerId === currentCustomer?.id
  );

  // 获取可申请退款的预约
  const refundableBookings = mockBookings.filter(
    b => b.customerId === currentCustomer?.id && 
    b.status !== 'cancelled' &&
    !mockRefundRequests.some(r => r.bookingId === b.id && r.status !== RefundStatus.REJECTED)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // 模拟提交退款申请
    setSubmitted(true);
    setTimeout(() => {
      setShowApplyForm(false);
      setSubmitted(false);
      setSelectedBooking('');
      setReason('');
    }, 1500);
  };

  const getStatusIcon = (status: RefundStatus) => {
    switch (status) {
      case RefundStatus.PENDING:
        return <Clock className="text-yellow-500" size={20} />;
      case RefundStatus.APPROVED:
        return <CheckCircle className="text-blue-500" size={20} />;
      case RefundStatus.REJECTED:
        return <XCircle className="text-red-500" size={20} />;
      case RefundStatus.COMPLETED:
        return <CheckCircle className="text-green-500" size={20} />;
      default:
        return null;
    }
  };

  const getStatusText = (status: RefundStatus) => {
    switch (status) {
      case RefundStatus.PENDING:
        return '待处理';
      case RefundStatus.APPROVED:
        return '已批准';
      case RefundStatus.REJECTED:
        return '已拒绝';
      case RefundStatus.COMPLETED:
        return '已完成';
      default:
        return '未知';
    }
  };

  const getStatusColor = (status: RefundStatus) => {
    switch (status) {
      case RefundStatus.PENDING:
        return 'bg-yellow-100 text-yellow-700';
      case RefundStatus.APPROVED:
        return 'bg-blue-100 text-blue-700';
      case RefundStatus.REJECTED:
        return 'bg-red-100 text-red-700';
      case RefundStatus.COMPLETED:
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/customer/profile')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft size={20} />
            <span>返回</span>
          </button>
          <h1 className="font-semibold text-gray-800">退款管理</h1>
          <div className="w-16"></div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* 申请退款按钮 */}
        {!showApplyForm && (
          <button
            onClick={() => setShowApplyForm(true)}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white py-4 rounded-2xl font-semibold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
          >
            <AlertCircle size={20} />
            申请退款
          </button>
        )}

        {/* 申请退款表单 */}
        {showApplyForm && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">提交退款申请</h2>
            
            {submitted ? (
              <div className="text-center py-8">
                <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
                <p className="text-gray-800 font-medium">退款申请已提交</p>
                <p className="text-sm text-gray-500 mt-2">我们将在1-3个工作日内处理</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    选择预约
                  </label>
                  <select
                    value={selectedBooking}
                    onChange={(e) => setSelectedBooking(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  >
                    <option value="">请选择要退款的预约</option>
                    {refundableBookings.map(booking => (
                      <option key={booking.id} value={booking.id}>
                        {booking.shopName} - {booking.serviceName} - ¥{booking.price} - 
                        {new Date(booking.scheduledTime).toLocaleDateString('zh-CN')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    退款原因
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    rows={4}
                    placeholder="请详细描述退款原因..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowApplyForm(false)}
                    className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors"
                  >
                    提交申请
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* 退款记录 */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">退款记录</h2>
          
          {customerRefunds.length > 0 ? (
            <div className="space-y-4">
              {customerRefunds.map(refund => (
                <div
                  key={refund.id}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-medium text-gray-800">{refund.shopName}</div>
                      <div className="text-sm text-gray-500">
                        申请时间：{new Date(refund.createdAt).toLocaleString('zh-CN')}
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(refund.status)}`}>
                      {getStatusIcon(refund.status)}
                      {getStatusText(refund.status)}
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 rounded-lg p-3 mb-3">
                    <div className="text-sm text-gray-600 mb-1">退款金额</div>
                    <div className="text-2xl font-bold text-orange-500">¥{refund.amount}</div>
                  </div>
                  
                  <div className="text-sm text-gray-600">
                    <div className="mb-1"><span className="font-medium">退款原因：</span>{refund.reason}</div>
                    {refund.rejectReason && (
                      <div className="text-red-600"><span className="font-medium">拒绝原因：</span>{refund.rejectReason}</div>
                    )}
                    {refund.processedAt && (
                      <div className="text-green-600 mt-2">
                        <span className="font-medium">处理时间：</span>
                        {new Date(refund.processedAt).toLocaleString('zh-CN')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <MessageSquare size={48} className="mx-auto mb-2 opacity-50" />
              <p>暂无退款记录</p>
            </div>
          )}
        </div>

        {/* 退款政策说明 */}
        <div className="bg-blue-50 rounded-2xl p-6">
          <h3 className="font-bold text-blue-800 mb-3">退款政策</h3>
          <ul className="text-sm text-blue-700 space-y-2">
            <li>• 服务开始前24小时可全额退款</li>
            <li>• 服务开始前12小时退款收取20%手续费</li>
            <li>• 服务开始前2小时内不支持退款</li>
            <li>• 如遇服务质量问题，可申请全额退款</li>
            <li>• 退款将在1-3个工作日内原路返回</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default RefundPage;
