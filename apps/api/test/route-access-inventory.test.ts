import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createLogger, loadRuntimeConfig } from '@atlas/platform';
import { METHOD_METADATA } from '@nestjs/common/constants';

import { AppModule } from '../src/app.module.js';
import {
  RATE_LIMIT_METADATA,
  type RateLimitMetadata,
} from '../src/rate-limit/rate-limit.decorator.js';
import {
  AUTHENTICATED_ONLY_ROUTE_METADATA,
  PERMISSION_REQUIREMENT_METADATA,
  PUBLIC_ROUTE_METADATA,
} from '../src/auth/index.js';

interface ControllerConstructor {
  readonly name: string;
  readonly prototype: object;
}

const isControllerConstructor = (value: unknown): value is ControllerConstructor =>
  typeof value === 'function' && 'prototype' in value;

const effectiveMetadata = (
  metadataKey: symbol,
  handler: object,
  controller: ControllerConstructor,
): unknown =>
  Reflect.getMetadata(metadataKey, handler) ?? Reflect.getMetadata(metadataKey, controller);

const config = loadRuntimeConfig({
  NODE_ENV: 'test',
  SERVICE_NAME: 'atlas-api-route-inventory',
  HOST: '127.0.0.1',
  PORT: '0',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/atlas_test',
  DATABASE_SSL: 'false',
  CORS_ALLOWED_ORIGINS: 'http://localhost:3001',
  REQUEST_BODY_LIMIT_BYTES: '1048576',
  ENABLE_ELECTRONIC_PAYMENTS: 'false',
  ENABLE_REAL_PAYOUTS: 'false',
});
const logger = createLogger({
  service: config.serviceName,
  environment: config.nodeEnv,
  level: config.logLevel,
});

describe('route access inventory', () => {
  it('classifies every registered HTTP handler exactly once', () => {
    const moduleDefinition = AppModule.register({ config, logger });
    const registeredControllers: readonly unknown[] = moduleDefinition.controllers ?? [];
    const inventory: string[] = [];

    for (const controller of registeredControllers) {
      assert.ok(isControllerConstructor(controller), 'AppModule registered a non-class controller');

      for (const propertyName of Object.getOwnPropertyNames(controller.prototype)) {
        const handler: unknown = Object.getOwnPropertyDescriptor(
          controller.prototype,
          propertyName,
        )?.value;
        if (typeof handler !== 'function' || !Reflect.hasMetadata(METHOD_METADATA, handler)) {
          continue;
        }

        const classifications: string[] = [
          effectiveMetadata(PUBLIC_ROUTE_METADATA, handler, controller) === true ? 'public' : null,
          effectiveMetadata(AUTHENTICATED_ONLY_ROUTE_METADATA, handler, controller) === true
            ? 'authenticated-only'
            : null,
          effectiveMetadata(PERMISSION_REQUIREMENT_METADATA, handler, controller) !== undefined
            ? 'permission-protected'
            : null,
        ].filter((classification): classification is string => classification !== null);

        assert.equal(
          classifications.length,
          1,
          `${controller.name}.${propertyName} must have exactly one access classification`,
        );
        inventory.push(`${controller.name}.${propertyName}:${classifications[0]}`);
        const rate = effectiveMetadata(RATE_LIMIT_METADATA, handler, controller) as
          RateLimitMetadata | undefined;
        if (rate)
          assert.match(
            rate.operation,
            /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/,
            `${controller.name}.${propertyName} has an invalid rate-limit identifier`,
          );
      }
    }

    assert.deepEqual(inventory.sort(), [
      'AdminOffersController.approve:permission-protected',
      'AdminOffersController.list:permission-protected',
      'AdminOffersController.reject:permission-protected',
      'AdminProductsController.catalogProducts:permission-protected',
      'AdminProductsController.list:permission-protected',
      'AdminProductsController.review:permission-protected',
      'AdminQuestionsController.hide:permission-protected',
      'AdminQuestionsController.list:permission-protected',
      'AdminReportsController.list:permission-protected',
      'AdminReportsController.resolve:permission-protected',
      'AdminReviewsController.list:permission-protected',
      'AdminReviewsController.moderate:permission-protected',
      'AdminSupportController.act:permission-protected',
      'AdminSupportController.get:permission-protected',
      'AdminSupportController.list:permission-protected',
      'CartController.get:permission-protected',
      'CartController.set:permission-protected',
      'CatalogController.categories:public',
      'CatalogController.list:public',
      'CatalogController.product:public',
      'CatalogController.seller:public',
      'CatalogReviewsController.product:public',
      'CatalogReviewsController.seller:public',
      'CheckoutController.create:permission-protected',
      'CheckoutController.get:permission-protected',
      'CheckoutController.place:permission-protected',
      'CustomerOrdersController.cancel:permission-protected',
      'CustomerOrdersController.confirmDelivery:permission-protected',
      'CustomerOrdersController.get:permission-protected',
      'CustomerOrdersController.list:permission-protected',
      'CustomerReviewsController.forOrder:permission-protected',
      'CustomerReviewsController.remove:permission-protected',
      'CustomerReviewsController.write:permission-protected',
      'DeliveryDestinationsController.fees:public',
      'DeliveryDestinationsController.list:public',
      'HealthController.live:public',
      'HealthController.ready:public',
      'OrderNotificationsController.list:permission-protected',
      'OrderNotificationsController.markRead:permission-protected',
      'ProductQuestionsController.ask:permission-protected',
      'ProductQuestionsController.list:public',
      'ProductReportsController.report:permission-protected',
      'SellerDeliveryController.list:permission-protected',
      'SellerDeliveryController.set:permission-protected',
      'SellerOffersController.create:permission-protected',
      'SellerOffersController.get:permission-protected',
      'SellerOffersController.list:permission-protected',
      'SellerOffersController.update:permission-protected',
      'SellerOrderNotesController.add:permission-protected',
      'SellerOrderNotesController.list:permission-protected',
      'SellerOrdersController.get:permission-protected',
      'SellerOrdersController.list:permission-protected',
      'SellerOrdersController.process:permission-protected',
      'SellerOrdersController.reject:permission-protected',
      'SellerOrdersController.signal:permission-protected',
      'SellerProductsController.catalogProducts:permission-protected',
      'SellerProductsController.categories:permission-protected',
      'SellerProductsController.get:permission-protected',
      'SellerProductsController.list:permission-protected',
      'SellerProductsController.submit:permission-protected',
      'SellerQuestionsController.answer:permission-protected',
      'SellerQuestionsController.list:permission-protected',
      'SellerReviewsController.list:permission-protected',
      'SellerReviewsController.reply:permission-protected',
      'SessionsController.list:authenticated-only',
      'SessionsController.revokeOne:authenticated-only',
      'SessionsController.revokeOthers:authenticated-only',
      'StockAlertsController.list:permission-protected',
      'StockAlertsController.status:permission-protected',
      'StockAlertsController.subscribe:permission-protected',
      'StockAlertsController.unsubscribe:permission-protected',
      'SupportController.act:permission-protected',
      'SupportController.create:permission-protected',
      'SupportController.forOrder:permission-protected',
      'SupportController.get:permission-protected',
      'SupportController.list:permission-protected',
    ]);
  });
});
