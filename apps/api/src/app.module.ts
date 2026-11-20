import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import {
  ORDER_SUPPORT,
  SupportController,
  AdminSupportController,
  type SupportRepositoryPort,
} from './commerce/support.controller.js';
import {
  AdminReviewsController,
  CatalogReviewsController,
  CustomerReviewsController,
  ORDER_REVIEWS,
  SellerReviewsController,
  type ReviewRepositoryPort,
} from './commerce/reviews.controller.js';
import {
  ORDER_NOTIFICATIONS,
  OrderNotificationsController,
  type NotificationRepositoryPort,
} from './commerce/notifications.controller.js';
import {
  DeliveryDestinationsController,
  SellerDeliveryController,
} from './commerce/delivery.controller.js';
import type { LiveCheckoutPolicy, SyntheticCheckoutPolicy } from '@atlas/commerce';
import {
  CheckoutController,
  CustomerOrdersController,
  SellerOrdersController,
} from './commerce/order.controller.js';
import {
  LOCAL_CHECKOUT_POLICY,
  ORDER_REPOSITORY,
  OrderInfrastructure,
  type OrderRepositoryPort,
} from './commerce/order-infrastructure.js';
import { CartController } from './commerce/cart.controller.js';
import {
  CART_REPOSITORY,
  CartInfrastructure,
  type CartRepositoryPort,
} from './commerce/cart-infrastructure.js';
import {
  AuthenticatePrincipal,
  PermissionAuthorizer,
  PrincipalResolver,
  SessionSelfService,
  type AccessCredentialVerifierPort,
  type IdentityAuthorizationRepositoryPort,
  type SessionSelfServicePort,
} from '@atlas/identity';
import type { RuntimeConfig } from '@atlas/platform';
import { APP_GUARD } from '@nestjs/core';
import type { Logger } from 'pino';

import {
  AuthenticationGuard,
  PermissionAuthorizationGuard,
  PRINCIPAL_AUTHENTICATOR,
  PRINCIPAL_PERMISSION_AUTHORIZER,
} from './auth/index.js';
import { type DatabaseHealthPort, PostgresDatabaseHealth } from './database-health.js';
import { GlobalErrorFilter } from './errors/global-error.filter.js';
import { HealthController } from './health/health.controller.js';
import { ReadinessState } from './health/readiness-state.js';
import { PostgresIdentityInfrastructure } from './identity/postgres-identity-infrastructure.js';
import { SharedDatabasePool } from './shared-database-pool.js';
import {
  AdminQuestionsController,
  PRODUCT_QUESTIONS,
  ProductQuestionsController,
  SellerQuestionsController,
  type QuestionsPort,
} from './commerce/questions.controller.js';
import {
  STOCK_ALERTS,
  StockAlertsController,
  type StockAlertsPort,
} from './commerce/stock-alerts.controller.js';
import { createMailer, MAILER, type Mailer } from './notifications/mailer.js';
import { MEDIA_SERVICE, ProductMediaService } from './media/media.js';
import { COD_RISK, CodRiskService, type SmsSender } from './commerce/cod-risk.js';
import { PhoneVerificationController } from './commerce/phone.controller.js';
import {
  ACCOUNT_ADMIN,
  ADMIN_SERVICE,
  AccountAdminService,
  AdminService,
} from './admin/admin.js';
import { AccountAdminController, AdminController } from './admin/admin.controller.js';
import {
  MediaController,
  SellerProductGalleryController,
  SellerProductImageController,
  SellerProductImageRemoveController,
} from './media/media.controller.js';
import {
  MARKETPLACE_NOTIFIER,
  MarketplaceNotifier,
  type MarketplaceLinks,
} from './notifications/marketplace-notifier.js';
import {
  AdminSellersController,
  AuthController,
  CustomerAccountController,
  PASSWORD_IDENTITY,
  SellerAccountController,
} from './identity/password/auth.controller.js';
import {
  composeCredentialVerifiers,
  PasswordIdentityRepository,
} from './identity/password/password-identity.js';
import { RejectingCredentialVerifier } from './identity/rejecting-credential-verifier.js';
import { SessionsController } from './identity/sessions.controller.js';
import {
  IDENTITY_AUTHORIZATION_REPOSITORY,
  SESSION_SELF_SERVICE,
  SESSION_SELF_SERVICE_PORT,
} from './identity/tokens.js';
import {
  RATE_LIMITER,
  RateLimitGuard,
  RejectingRateLimiter,
  type RateLimiterPort,
} from './rate-limit/index.js';
import { DATABASE_HEALTH, RUNTIME_CONFIG, STRUCTURED_LOGGER } from './tokens.js';
import {
  LOCAL_SESSION_ISSUER,
  LocalSessionController,
  type LocalSessionIssuer,
} from './identity/local-session.controller.js';
import {
  AdminOffersController,
  CatalogController,
  SellerOffersController,
} from './catalog/catalog.controller.js';
import {
  SellerProductsController,
  AdminProductsController,
} from './catalog/product-submissions.controller.js';
import {
  CATALOG_REPOSITORY,
  CatalogInfrastructure,
  type CatalogRepositoryPort,
} from './catalog/catalog-infrastructure.js';

export interface IdentityRuntimeOverrides {
  readonly credentialVerifier?: AccessCredentialVerifierPort;
  readonly authorizationRepository?: IdentityAuthorizationRepositoryPort;
  readonly sessionSelfServicePort?: SessionSelfServicePort;
}

export interface AppModuleOptions {
  readonly config: RuntimeConfig;
  readonly logger: Logger;
  readonly databaseHealth?: DatabaseHealthPort;
  readonly identity?: IdentityRuntimeOverrides;
  readonly rateLimiter?: RateLimiterPort;
  readonly catalog?: CatalogRepositoryPort;
  readonly cart?: CartRepositoryPort;
  readonly orders?: OrderRepositoryPort;
  readonly notifications?: NotificationRepositoryPort;
  readonly support?: SupportRepositoryPort;
  readonly reviews?: ReviewRepositoryPort;
  readonly stockAlerts?: StockAlertsPort;
  readonly questions?: QuestionsPort;
  readonly localCheckoutPolicy?: SyntheticCheckoutPolicy;
  /** Real cash-on-delivery checkout; requires password identity and excludes the fixture policy. */
  readonly liveCheckoutPolicy?: LiveCheckoutPolicy;
  readonly localSessionIssuer?: LocalSessionIssuer;
  /** `true` builds the PostgreSQL email/password identity on the shared pool. */
  readonly passwordIdentity?: PasswordIdentityRepository | true;
  /** Outgoing mail; defaults to SMTP_URL, or a log-only mailer in LOCAL/TEST. */
  readonly mailer?: Mailer;
  readonly links?: MarketplaceLinks;
  /** SMS gateway for customer phone verification; when absent, phones are not verified. */
  readonly sms?: SmsSender;
  /** Directory for seller product photos; enables upload and /media serving. */
  readonly mediaDirectory?: string;
}

@Module({})
// NestJS modules are class-based composition metadata by framework contract.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AppModule {
  public static register(options: AppModuleOptions): DynamicModule {
    if (
      options.localCheckoutPolicy !== undefined &&
      (!['local', 'test'].includes(options.config.nodeEnv) ||
        options.config.host !== '127.0.0.1' ||
        options.localSessionIssuer === undefined ||
        options.localCheckoutPolicy.environment !== options.config.nodeEnv)
    ) {
      throw new Error(
        'Checkout fixtures require explicit loopback LOCAL/TEST identity composition',
      );
    }
    if (
      options.liveCheckoutPolicy !== undefined &&
      (options.localCheckoutPolicy !== undefined || options.passwordIdentity === undefined)
    ) {
      throw new Error('Live checkout requires password identity and no fixture checkout policy');
    }
    if (
      options.localSessionIssuer !== undefined &&
      (!['local', 'test'].includes(options.config.nodeEnv) || options.config.host !== '127.0.0.1')
    ) {
      throw new Error('Synthetic session issuer requires explicit loopback LOCAL/TEST composition');
    }
    const databaseProvider =
      options.databaseHealth === undefined
        ? { provide: DATABASE_HEALTH, useClass: PostgresDatabaseHealth }
        : { provide: DATABASE_HEALTH, useValue: options.databaseHealth };
    const usesPostgresIdentity =
      options.identity?.authorizationRepository === undefined ||
      options.identity.sessionSelfServicePort === undefined;
    const identityInfrastructureProviders: Provider[] = usesPostgresIdentity
      ? [PostgresIdentityInfrastructure]
      : [];
    const authorizationRepositoryProvider: Provider =
      options.identity?.authorizationRepository === undefined
        ? {
            provide: IDENTITY_AUTHORIZATION_REPOSITORY,
            inject: [PostgresIdentityInfrastructure],
            useFactory: (infrastructure: PostgresIdentityInfrastructure) =>
              infrastructure.authorization,
          }
        : {
            provide: IDENTITY_AUTHORIZATION_REPOSITORY,
            useValue: options.identity.authorizationRepository,
          };
    const sessionSelfServicePortProvider: Provider =
      options.identity?.sessionSelfServicePort === undefined
        ? {
            provide: SESSION_SELF_SERVICE_PORT,
            inject: [PostgresIdentityInfrastructure],
            useFactory: (infrastructure: PostgresIdentityInfrastructure) => infrastructure.sessions,
          }
        : {
            provide: SESSION_SELF_SERVICE_PORT,
            useValue: options.identity.sessionSelfServicePort,
          };
    const credentialVerifier =
      options.identity?.credentialVerifier ?? new RejectingCredentialVerifier();

    return {
      module: AppModule,
      controllers: [
        HealthController,
        SessionsController,
        CatalogController,
        SellerOffersController,
        AdminOffersController,
        SellerProductsController,
        AdminProductsController,
        CartController,
        CheckoutController,
        CustomerOrdersController,
        SellerOrdersController,
        DeliveryDestinationsController,
        SellerDeliveryController,
        OrderNotificationsController,
        StockAlertsController,
        ProductQuestionsController,
        SellerQuestionsController,
        AdminQuestionsController,
        SupportController,
        AdminSupportController,
        CatalogReviewsController,
        CustomerReviewsController,
        SellerReviewsController,
        AdminReviewsController,
        ...(options.localSessionIssuer === undefined ? [] : [LocalSessionController]),
        ...(options.passwordIdentity === undefined
          ? []
          : [
              AuthController,
              SellerAccountController,
              AdminSellersController,
              PhoneVerificationController,
              CustomerAccountController,
              AdminController,
              AccountAdminController,
            ]),
        ...(options.mediaDirectory === undefined
          ? []
          : [
              SellerProductImageController,
              SellerProductImageRemoveController,
              SellerProductGalleryController,
              MediaController,
            ]),
      ],
      providers: [
        {
          provide: LOCAL_CHECKOUT_POLICY,
          useValue: options.localCheckoutPolicy ?? options.liveCheckoutPolicy ?? null,
        },
        ...(options.orders === undefined ||
        options.notifications === undefined ||
        options.support === undefined ||
        options.reviews === undefined ||
        options.stockAlerts === undefined ||
        options.questions === undefined
          ? [OrderInfrastructure]
          : []),
        options.reviews === undefined
          ? {
              provide: ORDER_REVIEWS,
              inject: [OrderInfrastructure],
              useFactory: (infra: OrderInfrastructure) => infra.reviews,
            }
          : { provide: ORDER_REVIEWS, useValue: options.reviews },
        options.support === undefined
          ? {
              provide: ORDER_SUPPORT,
              inject: [OrderInfrastructure],
              useFactory: (infra: OrderInfrastructure) => infra.support,
            }
          : { provide: ORDER_SUPPORT, useValue: options.support },
        options.questions === undefined
          ? {
              provide: PRODUCT_QUESTIONS,
              inject: [OrderInfrastructure],
              useFactory: (infra: OrderInfrastructure) => infra.questions,
            }
          : { provide: PRODUCT_QUESTIONS, useValue: options.questions },
        options.stockAlerts === undefined
          ? {
              provide: STOCK_ALERTS,
              inject: [OrderInfrastructure],
              useFactory: (infra: OrderInfrastructure) => infra.stockAlerts,
            }
          : { provide: STOCK_ALERTS, useValue: options.stockAlerts },
        options.notifications === undefined
          ? {
              provide: ORDER_NOTIFICATIONS,
              inject: [OrderInfrastructure],
              useFactory: (infra: OrderInfrastructure) => infra.notifications,
            }
          : { provide: ORDER_NOTIFICATIONS, useValue: options.notifications },
        options.orders === undefined
          ? {
              provide: ORDER_REPOSITORY,
              inject: [OrderInfrastructure],
              useFactory: (infra: OrderInfrastructure) => infra.repository,
            }
          : { provide: ORDER_REPOSITORY, useValue: options.orders },
        ...(options.cart === undefined ? [CartInfrastructure] : []),
        options.cart === undefined
          ? {
              provide: CART_REPOSITORY,
              inject: [CartInfrastructure],
              useFactory: (infra: CartInfrastructure) => infra.repository,
            }
          : { provide: CART_REPOSITORY, useValue: options.cart },
        ...(options.localSessionIssuer === undefined
          ? []
          : [{ provide: LOCAL_SESSION_ISSUER, useValue: options.localSessionIssuer }]),
        ...(options.catalog === undefined ? [CatalogInfrastructure] : []),
        options.catalog === undefined
          ? {
              provide: CATALOG_REPOSITORY,
              inject: [CatalogInfrastructure],
              useFactory: (infrastructure: CatalogInfrastructure) => infrastructure.repository,
            }
          : { provide: CATALOG_REPOSITORY, useValue: options.catalog },
        { provide: RUNTIME_CONFIG, useValue: options.config },
        { provide: STRUCTURED_LOGGER, useValue: options.logger },
        databaseProvider,
        SharedDatabasePool,
        ...(options.mediaDirectory === undefined
          ? []
          : [
              {
                provide: MEDIA_SERVICE,
                inject: [SharedDatabasePool],
                useFactory: (database: SharedDatabasePool) =>
                  new ProductMediaService(database.pool, options.mediaDirectory as string),
              },
            ]),
        ...(options.passwordIdentity === undefined
          ? []
          : [
              options.passwordIdentity === true
                ? {
                    provide: PASSWORD_IDENTITY,
                    inject: [SharedDatabasePool, RUNTIME_CONFIG],
                    useFactory: (database: SharedDatabasePool, config: RuntimeConfig) =>
                      new PasswordIdentityRepository(database.pool, config.identitySecretKey),
                  }
                : { provide: PASSWORD_IDENTITY, useValue: options.passwordIdentity },
              {
                provide: ADMIN_SERVICE,
                inject: [SharedDatabasePool],
                useFactory: (database: SharedDatabasePool) =>
                  new AdminService(database.pool, options.mediaDirectory ?? null),
              },
              {
                provide: ACCOUNT_ADMIN,
                inject: [SharedDatabasePool],
                useFactory: (database: SharedDatabasePool) => new AccountAdminService(database.pool),
              },
              {
                provide: COD_RISK,
                inject: [SharedDatabasePool],
                useFactory: (database: SharedDatabasePool) =>
                  new CodRiskService(database.pool, options.sms ?? null),
              },
              {
                provide: MAILER,
                useValue: options.mailer ?? createMailer(options.config, options.logger),
              },
              {
                provide: MARKETPLACE_NOTIFIER,
                inject: [PASSWORD_IDENTITY, MAILER],
                useFactory: (identity: PasswordIdentityRepository, mailer: Mailer) =>
                  new MarketplaceNotifier(identity, mailer, options.logger, {
                    sellerWebOrigin: options.links?.sellerWebOrigin ?? null,
                    customerWebOrigin: options.links?.customerWebOrigin ?? null,
                  }),
              },
            ]),
        ...identityInfrastructureProviders,
        authorizationRepositoryProvider,
        sessionSelfServicePortProvider,
        {
          provide: PRINCIPAL_AUTHENTICATOR,
          inject: [IDENTITY_AUTHORIZATION_REPOSITORY, { token: PASSWORD_IDENTITY, optional: true }],
          useFactory: (
            repository: IdentityAuthorizationRepositoryPort,
            passwordIdentity: PasswordIdentityRepository | undefined,
          ) =>
            new AuthenticatePrincipal(
              passwordIdentity === undefined
                ? credentialVerifier
                : options.identity?.credentialVerifier === undefined
                  ? passwordIdentity.credentialVerifier
                  : composeCredentialVerifiers(
                      options.identity.credentialVerifier,
                      passwordIdentity.credentialVerifier,
                    ),
              new PrincipalResolver(repository, { now: () => new Date() }),
            ),
        },
        {
          provide: PRINCIPAL_PERMISSION_AUTHORIZER,
          useFactory: () => new PermissionAuthorizer(),
        },
        {
          provide: SESSION_SELF_SERVICE,
          inject: [SESSION_SELF_SERVICE_PORT],
          useFactory: (sessions: SessionSelfServicePort) => new SessionSelfService(sessions),
        },
        {
          provide: RATE_LIMITER,
          useValue: options.rateLimiter ?? new RejectingRateLimiter(),
        },
        { provide: APP_GUARD, useClass: AuthenticationGuard },
        { provide: APP_GUARD, useClass: PermissionAuthorizationGuard },
        { provide: APP_GUARD, useClass: RateLimitGuard },
        ReadinessState,
        GlobalErrorFilter,
      ],
      exports: [ReadinessState],
    };
  }
}
