import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { rateLimit } from 'express-rate-limit';
import { config } from './config';
import apiRoutes from './routes';

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));

app.use(rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'errors.rate_limited' },
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api', apiRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'errors.not_found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (err.message?.startsWith('errors.')) {
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: 'errors.internal' });
});

export default app;
