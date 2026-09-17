import { Router, Request, Response } from 'express';
import { getDb } from '../db.js';

const router = Router();

// 上传图片到 Supabase Storage
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

    const db = getDb();
    if (!db) {
      res.status(500).json({ success: false, error: '数据库未连接' });
      return;
    }

    const fileName = `products/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
    const { data, error } = await db.storage.from('product-images').upload(fileName, buffer, {
      contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      upsert: false,
    });

    if (error) {
      console.error('[upload] 上传失败:', error.message);
      res.status(500).json({ success: false, error: '上传失败: ' + error.message });
      return;
    }

    const { data: publicUrlData } = db.storage.from('product-images').getPublicUrl(data.path);
    res.json({ success: true, url: publicUrlData.publicUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[upload] 异常:', message);
    res.status(500).json({ success: false, error: '上传失败' });
  }
});

export default router;
