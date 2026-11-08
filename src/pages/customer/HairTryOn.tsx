import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, CameraOff, Scissors } from 'lucide-react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import './HairTryOn.css';

const asset = (path: string) => `${import.meta.env.BASE_URL}ar/${path}`;
const styles = [
  { id: 'soft-crop', name: '轻盈短发', image: asset('styles/soft-crop.svg'), ratio: 280 / 360 },
  { id: 'side-part', name: '侧分造型', image: asset('styles/side-part.svg'), ratio: 280 / 360 },
  { id: 'long-layers', name: '层次长发', image: asset('styles/long-layers.svg'), ratio: 350 / 360 },
];

type Pose = { x: number; y: number; width: number; angle: number };

export default function HairTryOn() {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<FaceLandmarker | null>(null);
  const frameRef = useRef(0);
  const runRef = useRef(0);
  const poseRef = useRef<Pose | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastDetectionRef = useRef(0);
  const [styleIndex, setStyleIndex] = useState(0);
  const [state, setState] = useState<'idle' | 'starting' | 'running'>('idle');
  const [faceFound, setFaceFound] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const image = new Image();
    image.src = styles[styleIndex].image;
    imageRef.current = image;
    return () => { if (imageRef.current === image) imageRef.current = null; };
  }, [styleIndex]);

  const stop = useCallback(() => {
    runRef.current += 1;
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    detectorRef.current?.close();
    detectorRef.current = null;
    poseRef.current = null;
    lastVideoTimeRef.current = -1;
    lastDetectionRef.current = 0;
    const video = videoRef.current;
    if (video) { video.pause(); video.srcObject = null; }
    canvasRef.current?.getContext('2d')?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setState('idle');
    setFaceFound(false);
  }, []);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { document.removeEventListener('visibilitychange', onVisibility); stop(); };
  }, [stop]);

  const drawFrame = useCallback((run: number) => {
    if (runRef.current !== run) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const detector = detectorRef.current;
    if (video && canvas && detector && video.readyState >= 2 && video.videoWidth) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const now = performance.now();
        if (video.currentTime !== lastVideoTimeRef.current && now - lastDetectionRef.current >= 60) {
          lastVideoTimeRef.current = video.currentTime;
          lastDetectionRef.current = now;
          try {
            const face = detector.detectForVideo(video, now).faceLandmarks[0];
            const left = face?.[234], right = face?.[454], forehead = face?.[10];
            if (left && right && forehead) {
              const width = Math.hypot((right.x - left.x) * canvas.width, (right.y - left.y) * canvas.height) * 1.65;
              const next = {
                x: (left.x + right.x) * canvas.width / 2,
                y: forehead.y * canvas.height - width * 0.36,
                width,
                angle: Math.atan2((right.y - left.y) * canvas.height, (right.x - left.x) * canvas.width),
              };
              const previous = poseRef.current;
              poseRef.current = previous ? {
                x: previous.x * 0.65 + next.x * 0.35,
                y: previous.y * 0.65 + next.y * 0.35,
                width: previous.width * 0.65 + next.width * 0.35,
                angle: previous.angle * 0.65 + next.angle * 0.35,
              } : next;
              setFaceFound(true);
            } else {
              poseRef.current = null;
              setFaceFound(false);
            }
          } catch {
            stop();
            setError('当前设备无法持续跟踪人脸，请关闭其他摄像头应用后重试。');
            return;
          }
        }
        const pose = poseRef.current;
        const image = imageRef.current;
        if (pose && image?.complete && image.naturalWidth) {
          const height = pose.width * styles[styleIndex].ratio;
          ctx.save();
          ctx.translate(pose.x, pose.y);
          ctx.rotate(pose.angle);
          ctx.drawImage(image, -pose.width / 2, -height / 2, pose.width, height);
          ctx.restore();
        }
      }
    }
    frameRef.current = requestAnimationFrame(() => drawFrame(run));
  }, [styleIndex, stop]);

  // Style changes replace only the renderer; the camera and detector remain active.
  useEffect(() => {
    if (state !== 'running') return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => drawFrame(runRef.current));
    return () => cancelAnimationFrame(frameRef.current);
  }, [drawFrame, state]);

  const start = async () => {
    if (state !== 'idle') return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('请使用 HTTPS 或本机 localhost，在支持摄像头的浏览器中打开。');
      return;
    }
    setError('');
    setState('starting');
    const run = ++runRef.current;
    let stream: MediaStream | null = null;
    let detector: FaceLandmarker | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 960 } } });
      if (runRef.current !== run) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('摄像头画面未就绪');
      video.srcObject = stream;
      await video.play();
      const { FilesetResolver, FaceLandmarker: Landmarker } = await import('@mediapipe/tasks-vision');
      const files = await FilesetResolver.forVisionTasks(asset('wasm'));
      detector = await Landmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: asset('face_landmarker.task'), delegate: 'CPU' },
        runningMode: 'VIDEO', numFaces: 1,
        minFaceDetectionConfidence: 0.55, minTrackingConfidence: 0.55,
      });
      if (runRef.current !== run) { detector.close(); return; }
      detectorRef.current = detector;
      stream.getVideoTracks()[0]?.addEventListener('ended', stop, { once: true });
      setState('running');
    } catch (cause) {
      if (runRef.current !== run) return;
      stop();
      const permission = cause instanceof DOMException && (cause.name === 'NotAllowedError' || cause.name === 'PermissionDeniedError');
      setError(permission ? '摄像头权限未开启，请在浏览器设置中允许访问摄像头。' : '摄像头或人脸跟踪加载失败，请检查网络并重试。');
    }
  };

  return (
    <div className="tryon-page">
      <header className="tryon-header">
        <button type="button" className="tryon-icon-button" title="返回门店" aria-label="返回门店" onClick={() => navigate(`/customer/shop/${shopId || 'shop1'}`)}><ArrowLeft size={22} /></button>
        <div><strong>头部跟踪测试</strong><small>仅供内部技术验证</small></div>
        <span className="tryon-local">未开放</span>
      </header>
      <main className="tryon-content">
        <section className="tryon-stage" aria-label="实时摄像头试发型画面">
          <video ref={videoRef} className="tryon-video" autoPlay muted playsInline aria-label="前置摄像头画面" />
          <canvas ref={canvasRef} className="tryon-overlay" aria-hidden="true" />
          {state === 'idle' && <div className="tryon-cover"><Camera size={40} strokeWidth={1.5} /><strong>头部跟踪测试</strong><p>当前仅验证摄像头与人脸跟踪；发型是示意图，不能作为真实试发型效果。画面只在本机处理。</p><button type="button" className="tryon-primary" onClick={() => void start()}>开始测试</button></div>}
          {state === 'starting' && <div className="tryon-cover" role="status">正在启动摄像头与人脸跟踪...</div>}
          {state === 'running' && <><span className="tryon-status">{faceFound ? '已识别人脸' : '请将面部放在画面中央'}</span><button type="button" className="tryon-stop" onClick={stop} title="关闭摄像头"><CameraOff size={18} /> 关闭</button></>}
        </section>
        <div className="tryon-controls">
          {error && <p className="tryon-error" role="alert">{error}</p>}
          <div className="tryon-label"><strong>示意素材</strong><span>尚未制作真实发型效果</span></div>
          <div className="tryon-styles" role="group" aria-label="发型选择">
            {styles.map((style, index) => <button type="button" key={style.id} className={`tryon-style ${index === styleIndex ? 'selected' : ''}`} aria-pressed={index === styleIndex} onClick={() => setStyleIndex(index)}><img src={style.image} alt="" /><span>{style.name}</span></button>)}
          </div>
          <button type="button" className="tryon-book" onClick={() => navigate(`/customer/booking/${shopId || 'shop1'}`, { state: { hairstyle: styles[styleIndex].name } })}><Scissors size={19} /> 带着发型去预约</button>
        </div>
      </main>
    </div>
  );
}
