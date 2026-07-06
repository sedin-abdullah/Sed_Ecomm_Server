import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application } from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { env, isProduction } from './config/env';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import routes from './routes';

const app: Application = express();

// Render (and most PaaS) put the app behind a reverse proxy. Without this,
// express-rate-limit can't see the real client IP and buckets EVERY request
// under the proxy's single IP — i.e. all users/tests share one global limit.
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

if (!isProduction) {
  app.use(morgan('dev'));
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Now keyed per client IP (see `trust proxy` above). A browsing session or an
  // automated test run can legitimately fire hundreds of requests, so keep the
  // ceiling high — enough to never throttle real usage or e2e/automation suites
  // while still capping abusive floods. Override with RATE_LIMIT_MAX if needed.
  max: Number(process.env.RATE_LIMIT_MAX) || (isProduction ? 5000 : 100000),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', apiLimiter);

app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
