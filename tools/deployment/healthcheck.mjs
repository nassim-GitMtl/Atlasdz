try {
  const result = await fetch('http://127.0.0.1:3000/health/live', {
    signal: AbortSignal.timeout(2000),
    redirect: 'error',
  });
  if (!result.ok || (await result.json()).status !== 'ok') process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
