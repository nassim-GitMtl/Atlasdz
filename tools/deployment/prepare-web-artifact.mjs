import { cp, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function prepareWebArtifact(app) {
  if (!['customer-web', 'seller-center'].includes(app)) throw new Error('Unknown web artifact');
  const root = new URL(`../../apps/${app}/`, import.meta.url);
  const artifact = new URL(`.next/standalone/apps/${app}/`, root);
  await access(new URL('server.js', artifact));
  const publicPath = new URL('public/', root);
  const publicExists = await access(publicPath).then(
    () => true,
    (error) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    },
  );
  if (publicExists)
    await cp(fileURLToPath(publicPath), fileURLToPath(new URL('public/', artifact)), {
      recursive: true,
    });
  await cp(
    fileURLToPath(new URL('.next/static/', root)),
    fileURLToPath(new URL('.next/static/', artifact)),
    { recursive: true },
  );
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await prepareWebArtifact(process.argv[2]);
