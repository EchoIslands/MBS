import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, Copy, Loader2, Gift } from 'lucide-react';
import { useAppStore } from '../../store';
import { getApiBase, http } from '../../../shared/api-base';
import { getAuthToken } from '../../api';

const DEFAULT_SHOP_ID = 'shop1';

const CustomerInvite: React.FC = () => {
  const navigate = useNavigate();
  const { currentCustomer } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [referrerName, setReferrerName] = useState('会员');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!currentCustomer?.id) {
      setLoading(false);
      setError('请先登录');
      return;
    }
    generateInvite();
  }, [currentCustomer?.id]);

  const generateInvite = async () => {
    setLoading(true);
    setError('');
    try {
      const token = getAuthToken();
      const API_BASE = getApiBase();
      const result = await http<{ success: boolean; data?: { inviteUrl: string; qrCodeDataUrl: string; referrerName: string }; error?: string }>(
        `${API_BASE}/referrals/invite`,
        {
          method: 'POST',
          body: JSON.stringify({ shopId: DEFAULT_SHOP_ID, customerId: currentCustomer?.id }),
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        }
      );
      if (result?.success && result.data) {
        setInviteUrl(result.data.inviteUrl);
        setQrCodeDataUrl(result.data.qrCodeDataUrl);
        setReferrerName(result.data.referrerName || '会员');
      } else {
        setError(result?.error || '生成邀请码失败');
      }
    } catch (err: unknown) {
      setError((err as Error).message || '生成邀请码失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级方案
      const input = document.createElement('input');
      input.value = inviteUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100">
      <div className="max-w-md mx-auto min-h-screen bg-white shadow-xl">
        {/* 顶部导航 */}
        <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/customer/profile')}
            className="p-2 -ml-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-bold text-gray-800">邀请好友</h1>
        </div>

        <div className="p-5 space-y-6">
          {/* 说明 */}
          <div className="bg-gradient-to-r from-orange-500 to-pink-500 rounded-2xl p-5 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Gift size={20} />
              <h2 className="font-bold">好友消费，你赚返现</h2>
            </div>
            <p className="text-sm text-white/90">
              分享下方链接或二维码给好友，好友扫码领取新人优惠券并完成首次消费后，你将获得消费金额 {(currentCustomer?.referralBonusRate || 0.10) * 100}% 的返现奖励。
            </p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-orange-500 mb-3" />
              <p className="text-sm text-gray-500">正在生成邀请二维码...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-600 rounded-xl p-4 text-sm text-center">
              {error}
            </div>
          ) : (
            <>
              {/* 二维码 */}
              <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                <p className="text-center text-sm text-gray-500 mb-4">
                  {referrerName} 的专属邀请码
                </p>
                {qrCodeDataUrl ? (
                  <div className="flex justify-center">
                    <img
                      src={qrCodeDataUrl}
                      alt="邀请二维码"
                      className="w-56 h-56 rounded-xl"
                    />
                  </div>
                ) : (
                  <div className="w-56 h-56 mx-auto bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-sm">
                    二维码生成失败
                  </div>
                )}
              </div>

              {/* 链接复制 */}
              <div className="bg-gray-50 rounded-2xl p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">邀请链接</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteUrl}
                    readOnly
                    className="flex-1 px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-600 outline-none"
                  />
                  <button
                    onClick={handleCopy}
                    className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors"
                  >
                    {copied ? <Share2 size={16} /> : <Copy size={16} />}
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
              </div>

              {/* 提示 */}
              <p className="text-xs text-gray-400 text-center px-4">
                提示：你可以截图保存二维码，或直接复制链接发送给好友。
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerInvite;
