import { Router, Request, Response } from 'express';
import 'dotenv/config';
import OSS from 'ali-oss';

const router = Router();

// 阿里云 OSS 客户端（懒加载，避免启动时因缺环境变量而抛错）
let ossClient: OSS | null = null;

function getOssClient(): OSS {
  if (ossClient) return ossClient;

  const region = process.env.OSS_REGION;
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
  const bucket = process.env.OSS_BUCKET;

  if (!region || !accessKeyId || !accessKeySecret || !bucket) {
    throw new Error(
      'OSS 环境变量未配置完整（OSS_REGION / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET）'
    );
  }

  ossClient = new OSS({
    region,
    accessKeyId,
    accessKeySecret,
    bucket,
    secure: true,
  });

  return ossClient;
}

// 上传图片到阿里云 OSS
// POST /api/upload/image
// body: { image: 'data:image/png;base64,....' }
router.post('/image', async (req: Request, res: Response) => {
  try {
    const { image } = req.body || {};
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      res.status(400).json({ success: false, error: '请上传有效的图片文件' });
      return;
    }

    const match = image.match(/^data:image\/(\w+);base64,(.*)$/);
    if (!match) {
      res.status(400).json({ success: false, error: '图片格式不正确' });
      return;
    }

    const rawExt = match[1];
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
    const base64 = match[2];
    const buffer = Buffer.from(base64, 'base64');

    if (buffer.length > 2 * 1024 * 1024) {
      res.status(400).json({ success: false, error: '图片大小不能超过 2MB' });
      return;
    }

    const client = getOssClient();
    const fileName = `products/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;

    await client.put(fileName, buffer, {
      mime: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    });

    const url = `https://${process.env.OSS_BUCKET}.${process.env.OSS_REGION}.aliyuncs.com/${fileName}`;
    res.json({ success: true, url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[upload] 异常:', message);
    res.status(500).json({ success: false, error: '上传失败' });
  }
});

export default router;