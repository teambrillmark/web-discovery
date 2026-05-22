import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { QueryEngineController } from '../controller/queryEngine.controller';
import type { QueryEngineService } from '../services/queryEngine.service';
import { InvalidDomainError, QueryEngineError } from '../types';
import type { Logger } from '../../../lib/logger';

const makeLogger = (): Logger =>
  ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  }) as unknown as Logger;

function makeRequest(body: unknown, requestId?: string): Request {
  return {
    body,
    path: '/api/v1/query-engine',
    headers: requestId ? { 'x-request-id': requestId } : {},
  } as unknown as Request;
}

function makeResponse(): { res: Response; statusMock: ReturnType<typeof vi.fn>; jsonMock: ReturnType<typeof vi.fn> } {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
  const res = { status: statusMock, json: jsonMock } as unknown as Response;
  return { res, statusMock, jsonMock };
}

const makeService = (result?: { normalizedDomain: string; exclusions: string[] }): QueryEngineService =>
  ({
    run: vi.fn().mockResolvedValue(
      result ?? { normalizedDomain: 'example.com', exclusions: [] },
    ),
  }) as unknown as QueryEngineService;

describe('QueryEngineController', () => {
  let controller: QueryEngineController;
  let service: QueryEngineService;
  let logger: Logger;
  let next: NextFunction;

  beforeEach(() => {
    logger = makeLogger();
    service = makeService();
    next = vi.fn() as unknown as NextFunction;
    controller = new QueryEngineController(service, logger);
  });

  describe('handle — validation', () => {
    it('returns 400 when body is missing query field', async () => {
      const { res, statusMock, jsonMock } = makeResponse();

      await controller.handle(makeRequest({}), res, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Validation failed' }),
      );
    });

    it('returns 400 when query is empty string', async () => {
      const { res, statusMock } = makeResponse();

      await controller.handle(makeRequest({ query: '' }), res, next);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('returns 400 when query exceeds max length', async () => {
      const { res, statusMock } = makeResponse();

      await controller.handle(makeRequest({ query: 'a'.repeat(2049) }), res, next);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('does not call service when validation fails', async () => {
      const { res } = makeResponse();

      await controller.handle(makeRequest({}), res, next);

      expect(service.run).not.toHaveBeenCalled();
    });
  });

  describe('handle — success', () => {
    it('returns 200 with normalizedDomain and exclusions', async () => {
      service = makeService({ normalizedDomain: 'shopify.com', exclusions: ['bigcommerce.com'] });
      controller = new QueryEngineController(service, logger);
      const { res, statusMock, jsonMock } = makeResponse();

      await controller.handle(makeRequest({ query: 'shopify.com' }), res, next);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          normalizedDomain: 'shopify.com',
          exclusions: ['bigcommerce.com'],
        }),
      );
    });

    it('includes requestId in response when header is present', async () => {
      const { res, jsonMock } = makeResponse();

      await controller.handle(makeRequest({ query: 'example.com' }, 'req-abc-123'), res, next);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: 'req-abc-123' }),
      );
    });

    it('passes validated query to service', async () => {
      const { res } = makeResponse();

      await controller.handle(makeRequest({ query: '  example.com  ' }), res, next);

      // Zod trims, so service receives trimmed value
      expect(service.run).toHaveBeenCalledWith({ query: 'example.com' });
    });
  });

  describe('handle — error forwarding', () => {
    it('calls next with InvalidDomainError from service', async () => {
      const error = new InvalidDomainError('bad domain');
      vi.mocked(service.run).mockRejectedValue(error);
      const { res } = makeResponse();

      await controller.handle(makeRequest({ query: 'example.com' }), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('calls next with QueryEngineError from service', async () => {
      const error = new QueryEngineError('DB failure');
      vi.mocked(service.run).mockRejectedValue(error);
      const { res } = makeResponse();

      await controller.handle(makeRequest({ query: 'example.com' }), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('logs error before calling next', async () => {
      vi.mocked(service.run).mockRejectedValue(new QueryEngineError('fail'));
      const { res } = makeResponse();

      await controller.handle(makeRequest({ query: 'example.com' }), res, next);

      expect(logger.error).toHaveBeenCalled();
    });
  });
});
