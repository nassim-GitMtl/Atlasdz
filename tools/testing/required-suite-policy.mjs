export const requiredSecurityPackages = Object.freeze([
  '@atlas/api',
  '@atlas/customer-web',
  '@atlas/seller-center',
  '@atlas/identity',
  '@atlas/identity-postgres',
  '@atlas/platform',
]);

export function assertRequiredSuite(summary, suite) {
  const tasks = Array.isArray(summary?.tasks)
    ? summary.tasks.filter(
        (task) =>
          task?.task === suite &&
          typeof task.command === 'string' &&
          task.command.trim() !== '' &&
          task.command !== '<NONEXISTENT>',
      )
    : [];
  if (tasks.length === 0)
    throw new Error(`${suite} has no executable package task; no evidence was produced.`);
  if (suite === 'test:security') {
    const present = new Set(tasks.map((task) => task.package));
    const missing = requiredSecurityPackages.filter((name) => !present.has(name));
    if (missing.length > 0)
      throw new Error(`${suite} is missing required package coverage: ${missing.join(', ')}.`);
  }
  return tasks;
}
