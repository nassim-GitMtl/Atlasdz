import { SetMetadata } from '@nestjs/common';

export const AUTHENTICATED_ONLY_ROUTE_METADATA = Symbol('atlas.api.authenticated-only-route');

export const AuthenticatedOnly = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(AUTHENTICATED_ONLY_ROUTE_METADATA, true);
