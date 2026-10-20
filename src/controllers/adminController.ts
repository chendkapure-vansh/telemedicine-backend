import { Request, Response, NextFunction } from 'express';
import { analyticsService, AnalyticsService } from '../services/analyticsService';

/**
 * Controller handling administrative dashboard and platform analytics.
 */
export class AdminController {
  constructor(private service: AnalyticsService = analyticsService) {}

  /**
   * Retrieves high-level platform analytics overview.
   */
  getAnalyticsOverview = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const overview = await this.service.getOverview();
      res.status(200).json(overview);
    } catch (err) {
      next(err);
    }
  };
}

export const adminController = new AdminController();
