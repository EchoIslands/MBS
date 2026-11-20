import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { liveQueueApi } from '../../api';
import { useAppStore } from '../../store';
import { useLiveQueue } from '../../hooks/useLiveQueue';
import type { LiveQueueDesk, QueueAvailability } from '../../../shared/lib/liveQueue';
import { getAvatarUrl } from '../../lib/avatar';

type Operator = { employeeId: string; name: string; password: string };

/** 公共显示屏。显示屏账号只读，发型师操作必须先解锁自己的身份。 */
export default function QueueDisplay() {
  const shop = useAppStore((state) => state.currentShop);
  const employee = useAppStore((state) => state.currentEmployee);
  const loader = useCallback(() => liveQueueApi.desk(shop?.id || ''), [shop?.id]);
  const { data, error, stale, lastSync, refresh } = useLiveQueue<LiveQueueDesk>(loader, !!shop?.id, 2000);
  const displayAccount = employee?.role === 'queue_display';
  const [pending, setPending] = useState<QueueAvailability | null>(null);
  const [password, setPassword] = useState('');
  const [operator, setOperator] = useState<Operator | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const unlock = () => {
    if (!pending || !password.trim()) return;
    setOperator({ employeeId: pending.id, name: pending.name, password: password.trim() });
    setMessage('已解锁该发型师操作区，操作只会作用于本人队列');
    setPassword('');
    setPending(null);
  };

  const runAvailability = async (item: QueueAvailability, minutes: number) => {
    if (!operator || operator.employeeId !== item.id || stale || busy || !shop?.id) return;
    setBusy(true);
    setMessage('');
    try {
      await liveQueueApi.kioskAvailability(shop.id, operator.employeeId, operator.password, item.version, minutes);
      setMessage(`${item.name} · 状态已更新`);
      await refresh(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '更新失败，请刷新后重试');
    } finally {
      setBusy(false);
    }
  };

  const runBooking = async (booking: LiveQueueDesk['bookings'][number], action: string, minutes?: number) => {
    if (!operator || operator.employeeId !== booking.stylistId || stale || busy || !shop?.id) return;
    setBusy(true);
    setMessage('');
    try {
      await liveQueueApi.kioskAction(
        shop.id,
        operator.employeeId,
        operator.password,
        booking.id,
        action,
        booking.version,
        minutes,
      );
      setMessage(`${operator.name} · 操作已记录`);
      await refresh(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '更新失败，请刷新后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-orange-50 p-6 text-gray-900 md:p-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">{shop?.name} · 服务动态</h1>
          <p className="mt-3 text-xl">到店请先由前台确认排队 · 等待时间以现场动态为准</p>
        </div>
        <div className="flex gap-3">
          <button
            className="rounded-xl border bg-white p-4"
            onClick={() => void document.documentElement.requestFullscreen().catch(() => {})}
          >
            全屏显示
          </button>
          {!displayAccount && (
            <Link className="rounded-xl border bg-white p-4" to="/shop/queue-desk">
              员工操作台
            </Link>
          )}
        </div>
      </header>

      <div className="mb-4 rounded-xl border border-orange-200 bg-white p-4 text-lg text-gray-700">
        <strong>{displayAccount ? '显示屏专用账号 · 默认只读' : '店内显示屏只读'}</strong> ·{' '}
        {displayAccount
          ? '发型师点击本人卡片后输入自己的登录密码，可在本屏操作本人状态。'
          : '状态操作请在员工操作台完成。'}
      </div>

      <div role="status" className={`mb-6 rounded-xl p-4 text-xl ${stale ? 'bg-red-100 text-red-800' : 'bg-white'}`}>
        {stale ? '同步中断或尚未完成，旧状态不代表现场，请咨询前台' : '每2秒同步'} · 最近同步{' '}
        {lastSync ? new Date(lastSync).toLocaleTimeString('zh-CN') : '尚未同步'}
        <button className="ml-4 underline" onClick={() => void refresh(true)}>
          刷新
        </button>
        {error && <p>{error}</p>}
        {message && <p className="mt-2 text-base font-bold">{message}</p>}
        {displayAccount && operator && (
          <button className="ml-4 underline" onClick={() => setOperator(null)}>退出当前操作人</button>
        )}
      </div>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {data?.availability.map((availability) => {
          const lane = data.bookings.filter((booking) => booking.stylistId === availability.id);
          const current = lane.find((booking) => booking.state === 'serving');
          const called = lane.find((booking) => booking.state === 'called');
          const next = lane.find((booking) => ['arrived', 'returned'].includes(booking.state));
          const waiting = lane.filter((booking) => ['arrived', 'returned', 'called'].includes(booking.state));
          const paused = !!availability.pausedUntil && Date.parse(availability.pausedUntil) > Date.now();
          const state = current ? 'serving' : called ? 'called' : paused ? 'paused' : 'available';
          const stateLabel = state === 'serving' ? '服务中' : state === 'called' ? '已叫号' : state === 'paused' ? '暂停接客' : '可接待';
          const stateTone = state === 'serving'
            ? 'border-blue-200 bg-blue-50 text-blue-900'
            : state === 'called'
              ? 'border-orange-200 bg-orange-50 text-orange-900'
              : state === 'paused'
                ? 'border-gray-200 bg-gray-100 text-gray-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900';
          const canOperate = availability.role === 'stylist';
          const own = operator?.employeeId === availability.id;

          return (
            <article key={availability.id} className="rounded-3xl border border-orange-200 bg-white p-7">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => displayAccount && canOperate && setPending(availability)}
              >
                <div className="flex items-center gap-4">
                  <img
                    className="h-16 w-16 rounded-full border-2 border-orange-100 object-cover"
                    src={availability.avatar || getAvatarUrl(availability.name)}
                    alt={`${availability.name}头像`}
                    onError={(event) => { event.currentTarget.src = getAvatarUrl(availability.name); }}
                  />
                  <div>
                    <h2 className="text-3xl font-bold">{availability.name}</h2>
                    <p className="mt-1 text-lg text-gray-500">服务台</p>
                  </div>
                </div>
                <p className={`my-5 rounded-2xl border p-5 text-3xl font-bold ${stateTone}`}>
                  {stale ? '状态待核实' : stateLabel}
                </p>
              </button>

              {!stale && (
                <>
                  <p className="text-xl">
                    {current
                      ? `当前服务：${current.serviceName}`
                      : called
                        ? `请 ${called.queueNumber ? `排队号 ${called.queueNumber}` : '已叫号顾客'} 到服务位`
                        : paused
                          ? '稍后恢复接待'
                          : '欢迎到店咨询'}
                  </p>
                  <p className="mt-4 text-2xl">现场等候 {waiting.length} 位</p>
                  {current && (
                    <p className="mt-3 text-lg text-gray-600">
                      {current.progressStale
                        ? '进度待更新，请点下方更新'
                        : current.progressRemainingMinutes != null
                          ? `上次更新预计剩余 ${current.progressRemainingMinutes} 分钟`
                          : '服务结束时间待更新'}
                    </p>
                  )}
                </>
              )}

              {displayAccount && own && (
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button disabled={busy} onClick={() => void runAvailability(availability, 20)} className="rounded-xl bg-orange-100 p-3 font-bold disabled:opacity-50">暂停20分钟</button>
                  <button disabled={busy} onClick={() => void runAvailability(availability, 0)} className="rounded-xl border p-3 font-bold disabled:opacity-50">恢复接客</button>
                  {current && <>
                    <button disabled={busy} onClick={() => void runBooking(current, 'progress_updated', 10)} className="rounded-xl bg-blue-100 p-3 font-bold disabled:opacity-50">还需10分钟</button>
                    <button disabled={busy} onClick={() => void runBooking(current, 'service_finished')} className="rounded-xl bg-emerald-100 p-3 font-bold disabled:opacity-50">结束服务</button>
                  </>}
                  {called && <button disabled={busy} onClick={() => void runBooking(called, 'service_started')} className="col-span-2 rounded-xl bg-orange-100 p-3 font-bold disabled:opacity-50">顾客已到位，开始服务</button>}
                  {!current && !called && next && <button disabled={busy} onClick={() => void runBooking(next, 'called')} className="col-span-2 rounded-xl bg-orange-100 p-3 font-bold disabled:opacity-50">叫下一位</button>}
                </div>
              )}
              {displayAccount && <p className="mt-4 text-sm text-gray-500">{canOperate ? '点击头像卡片可切换操作人。服务器会校验本人身份，不能操作其他发型师。' : '店长状态由客服或 CEO 在员工操作台代操作。'}</p>}
            </article>
          );
        })}
      </section>

      {!data && <p className="p-10 text-center text-2xl">正在读取门店服务状态…</p>}
      <footer className="mt-8 text-xl text-gray-600">所有操作写入同一套排队事务，客服、CEO、顾客端和显示屏会按服务器状态同步。同步中断时页面会明确提示，旧状态不会继续作为依据。</footer>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onSubmit={(event) => { event.preventDefault(); unlock(); }}>
            <h2 className="text-2xl font-bold">解锁 {pending.name} 的操作</h2>
            <p className="mt-3 text-gray-600">请输入该发型师本人登录密码。验证只保存在当前页面内，刷新显示屏后需要重新验证。</p>
            <input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="发型师登录密码" className="mt-5 w-full rounded-xl border p-4" />
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => { setPending(null); setPassword(''); }} className="flex-1 rounded-xl border p-3">取消</button>
              <button type="submit" disabled={!password.trim()} className="flex-1 rounded-xl bg-orange-500 p-3 font-bold text-white disabled:opacity-50">解锁操作</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
