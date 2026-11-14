import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE_METADATA = Symbol('atlas.api.public-route');

export const Public = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(PUBLIC_ROUTE_METADATA, true);
