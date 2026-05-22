import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../../../lib/logger';
import type { QueryEngineService } from '../services/queryEngine.service';
import { QueryEngineInputSchema } from '../validators/queryEngine.validator';

export class QueryEngineController {
  constructor(
    private readonly queryEngineService: QueryEngineService,
    private readonly logger: Logger,
  ) {}

  async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = req.headers['x-request-id'] as string | undefined;
    const logCtx = { requestId, path: req.path };

    this.logger.info(logCtx, 'QueryEngine request received');

    const parsed = QueryEngineInputSchema.safeParse(req.body);
    if (!parsed.success) {
      this.logger.warn({ ...logCtx, issues: parsed.error.issues }, 'QueryEngine input validation failed');
      res.status(400).json({
        error: 'Validation failed',
        issues: parsed.error.issues,
        requestId,
      });
      return;
    }

    try {
      const result = await this.queryEngineService.run(parsed.data);
      this.logger.info(
        { ...logCtx, normalizedDomain: result.normalizedDomain },
        'QueryEngine request completed',
      );
      res.status(200).json({ ...result, requestId });
    } catch (error) {
      this.logger.error({ ...logCtx, error }, 'QueryEngine request failed');
      next(error);
    }
  }
}
