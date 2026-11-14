import { createLogger, loadRuntimeConfig, waitForTerminationSignal } from '@atlas/platform';

const config = loadRuntimeConfig({
  ...process.env,
  SERVICE_NAME: 'atlas-worker',
});
const logger = createLogger({
  service: config.serviceName,
  environment: config.nodeEnv,
  level: config.logLevel,
});

logger.info(
  { queueAdaptersEnabled: false },
  'worker composition root ready with external delivery disabled',
);
const signal = await waitForTerminationSignal();
logger.info({ signal }, 'worker shutdown completed');
