import express from 'express';

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'ok' });
});

app.all('/api/*', (req, res) => {
  res.json({ success: true, data: [] });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'not found' });
});

export default app;
