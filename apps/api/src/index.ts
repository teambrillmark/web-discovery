import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { queriesRouter } from './routes/queries';
import { entitiesRouter } from './routes/entities';
import { crawlRouter } from './routes/crawl';
import { exportRouter } from './routes/export';

dotenv.config({ path: path.join(__dirname, '../../..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  // Allow SSE connections to keep headers
  exposedHeaders: ['Content-Type'],
}));
app.use(express.json());

// Routes
app.use('/api/queries', queriesRouter);
app.use('/api/entities', entitiesRouter);
app.use('/api/crawl', crawlRouter);
app.use('/api/export', exportRouter);

// Health check
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Error]', err.message, err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Discovery API running at http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});
