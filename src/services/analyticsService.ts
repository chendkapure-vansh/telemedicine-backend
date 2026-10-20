import {
  analyticsRepository,
  AnalyticsRepository,
  AnalyticsOverview,
} from '../repositories/analyticsRepository';
import { redisClient } from '../config/redis';
import { logger } from '../config/logger';

/**
 * Service managing administrative metrics with Redis L2 caching (TTL = 60s).
 */
export class AnalyticsService {
  constructor(private analyticsRepo: AnalyticsRepository = analyticsRepository) {}

  /**
   * Retrieves administrative overview KPIs, utilizing Redis cache to minimize analytical load on PostgreSQL.
   *
   * @returns Aggregated platform metrics
   */
  async getOverview(): Promise<AnalyticsOverview> {
    const cacheKey = 'cache:analytics:overview';

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as AnalyticsOverview;
      }
    } catch (err) {
      logger.warn({ err }, 'Redis cache read error for analytics, falling back to database query');
    }

    const overview = await this.analyticsRepo.getOverview();

    try {
      await redisClient.set(cacheKey, JSON.stringify(overview), 'EX', 60);
    } catch (err) {
      logger.warn({ err }, 'Redis cache write error for analytics');
    }

    return overview;
  }
}

export const analyticsService = new AnalyticsService();
