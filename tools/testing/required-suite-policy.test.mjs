import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRequiredSuite, requiredSecurityPackages } from './required-suite-policy.mjs';

const securityTasks = () =>
  requiredSecurityPackages.map((name) => ({
    package: name,
    task: 'test:security',
    command: 'node --test example.test.js',
  }));

test('required suites reject empty, malformed or non-executable discovery', () => {
  for (const summary of [null, {}, { tasks: [] }, { tasks: {} }])
    assert.throws(() => assertRequiredSuite(summary, 'test:e2e'), /no executable/);
  for (const command of [undefined, null, '', ' ', '<NONEXISTENT>'])
    assert.throws(
      () => assertRequiredSuite({ tasks: [{ task: 'test:ui', command }] }, 'test:ui'),
      /no executable/,
    );
});

test('a build task cannot masquerade as an executable test suite', () => {
  assert.throws(
    () => assertRequiredSuite({ tasks: [{ task: 'build', command: 'tsc' }] }, 'test:security'),
    /no executable/,
  );
});

test('the security suite requires every baseline package, not merely one runnable task', () => {
  for (const missing of requiredSecurityPackages) {
    const tasks = securityTasks().filter((task) => task.package !== missing);
    assert.throws(
      () => assertRequiredSuite({ tasks }, 'test:security'),
      (error) => error instanceof Error && error.message.includes(missing),
    );
  }
  assert.equal(assertRequiredSuite({ tasks: securityTasks() }, 'test:security').length, 6);
});

test('nonexistent or duplicate task entries cannot hide a missing security package', () => {
  const tasks = securityTasks();
  tasks[0].command = '<NONEXISTENT>';
  tasks.push(tasks[1]);
  assert.throws(() => assertRequiredSuite({ tasks }, 'test:security'), /@atlas\/api/);
});
