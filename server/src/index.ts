import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import auth from './routes/auth.js';
import accounts from './routes/accounts.js';
import transactions from './routes/transactions.js';
import finance from './routes/finance.js';
import fx from './routes/fx.js';
import insights from './routes/insights.js';
import summary from './routes/summary.js';
import { assertConfig, frontendOrigins } from './config.js';

assertConfig();

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: frontendOrigins(), credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(morgan('tiny'));
app.use(rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false, skip: (req) => req.path === '/health' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'roviel-api', time: new Date().toISOString() }));
app.use('/api/auth', auth);
app.use('/api/accounts', accounts);
app.use('/api/transactions', transactions);
app.use('/api/fx', fx);
app.use('/api', finance);
app.use('/api/summary', summary);
app.use('/api/insights', insights);

// Never crash on DB/network errors — return 503 instead.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('api error', err?.message || err);
  if (res.headersSent) return;
  res.status(503).json({ error: 'Service temporarily unavailable. Retry.' });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`Roviel API on :${PORT}`));
