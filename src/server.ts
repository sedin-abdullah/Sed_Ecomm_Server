import { Server } from 'http';
import app from './app';
import { connectDB } from './config/db';
import { env } from './config/env';
import { fixProductImages } from './seeders/fixProductImages';
import { ensureManager } from './seeders/ensureManager';

let server: Server;

async function start(): Promise<void> {
  await connectDB();

  // Guarantee the top-level Manager account exists (idempotent, never wipes).
  try {
    const m = await ensureManager();
    console.log(`[startup] Manager account ${m.created ? 'created' : 'present'}: ${m.email}`);
  } catch (err) {
    console.error('[startup] ensureManager failed (continuing):', err);
  }

  // One-shot data fix triggered from the dashboard (for hosts without a shell):
  // set RUN_IMAGE_FIX=1, redeploy, then unset it once you've confirmed.
  if (process.env.RUN_IMAGE_FIX === '1') {
    try {
      const { updated, skipped } = await fixProductImages();
      console.log(`[startup] Image fix ran: ${updated} products updated, ${skipped.length} skipped.`);
    } catch (err) {
      console.error('[startup] Image fix failed (continuing to serve):', err);
    }
  }

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
