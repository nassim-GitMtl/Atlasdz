export function waitForTerminationSignal(): Promise<NodeJS.Signals> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (signal: NodeJS.Signals): void => {
      if (settled) {
        process.exitCode = 1;
        return;
      }
      settled = true;
      resolve(signal);
    };

    process.once('SIGTERM', finish);
    process.once('SIGINT', finish);
  });
}
