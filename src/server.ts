import { Server } from 'http';
import app from './app';
import { connectDB } from './config/db';
import { env } from './config/env';

let server: Server;

async function start(): Promise<void> {
  await connectDB();

  server = app.listen(env.PORT, () => {
    console.log(`[server] Sed_Ecomm API listening on port ${env.PORT} (${env.NODE_ENV})`);
    console.log(`[server] Health check: http://localhost:${env.PORT}/api/v1/health`);
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Unhandled promise rejection:', reason);
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error('[fatal] Uncaught exception:', error);
  process.exit(1);
});

start().catch((error) => {
  console.error('[fatal] Failed to start server:', error);
  process.exit(1);
});
