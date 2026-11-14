import { createLogger, loadRuntimeConfig, waitForTerminationSignal } from '@atlas/platform';

const config = loadRuntimeConfig({
  ...process.env,
  SERVICE_NAME: 'atlas-scheduler',
});
const logger = createLogger({
  service: config.serviceName,
  environment: config.nodeEnv,
  level: config.logLevel,
});

logger.info(
  { scheduledJobsEnabled: false },
  'scheduler composition root ready with scheduled work disabled',
);
const signal = await waitForTerminationSignal();
logger.info({ signal }, 'scheduler shutdown completed');
