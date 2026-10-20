import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { doctorSearchService, DoctorSearchService } from '../services/doctorSearchService';

const searchDoctorsSchema = z.object({
  specialization: z.string().optional(),
  language: z.string().optional(),
  max_fee: z.coerce.number().positive('max_fee must be a positive number').optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Controller handling public doctor discovery searches.
 */
export class DoctorController {
  constructor(private searchService: DoctorSearchService = doctorSearchService) {}

  /**
   * Searches doctors by specialization, language, and max fee with pagination and caching.
   */
  searchDoctors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = searchDoctorsSchema.parse(req.query);
      const result = await this.searchService.searchDoctors(filters);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

export const doctorController = new DoctorController();
