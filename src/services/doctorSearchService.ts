import {
  userRepository,
  UserRepository,
  DoctorSummary,
  DoctorSearchFilter,
} from '../repositories/userRepository';
import { redisClient } from '../config/redis';
import { logger } from '../config/logger';

/**
 * Paginated response structure for doctor discovery searches.
 */
export interface DoctorSearchResult {
  doctors: DoctorSummary[];
  total: number;
  page: number;
}

/**
 * Service providing high-speed doctor discovery search with sub-200ms p95 latency.
 * Employs Redis L2 caching (TTL = 300s) on top of composite PostgreSQL indexes.
 */
export class DoctorSearchService {
  constructor(private userRepo: UserRepository = userRepository) {}

  /**
   * Searches doctors by specialization, language, and max fee with Redis caching.
   *
   * @param filter - Search criteria and pagination parameters
   * @returns Paginated doctor summaries and total count
   */
  async searchDoctors(filter: DoctorSearchFilter): Promise<DoctorSearchResult> {
    const spec = (filter.specialization || 'all').toLowerCase().trim();
    const lang = (filter.language || 'all').toLowerCase().trim();
    const fee = filter.max_fee !== undefined ? filter.max_fee : 'all';
    const page = Math.max(1, filter.page || 1);
    const limit = Math.max(1, Math.min(100, filter.limit || 20));

    const cacheKey = `cache:doctors:spec:${spec}:lang:${lang}:fee:${fee}:page:${page}:limit:${limit}`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as DoctorSearchResult;
      }
    } catch (err) {
      logger.warn({ err }, 'Redis cache read error for doctor search, falling back to database');
    }

    const { doctors, total } = await this.userRepo.searchDoctors({
      ...filter,
      page,
      limit,
    });

    const result: DoctorSearchResult = {
      doctors,
      total,
      page,
    };

    try {
      await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 300);
    } catch (err) {
      logger.warn({ err }, 'Redis cache write error for doctor search');
    }

    return result;
  }
}

export const doctorSearchService = new DoctorSearchService();
