import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { slotService, SlotService } from '../services/slotService';

const createSlotSchema = z.object({
  start_time: z.string().datetime({ message: 'start_time must be a valid ISO-8601 date-time string' }),
  end_time: z.string().datetime({ message: 'end_time must be a valid ISO-8601 date-time string' }),
});

const getSlotsQuerySchema = z.object({
  doctor_id: z.string().uuid({ message: 'doctor_id query parameter must be a valid UUID' }),
});

/**
 * Controller handling doctor availability slot creation and listing.
 */
export class SlotController {
  constructor(private service: SlotService = slotService) {}

  /**
   * Schedules a single consultation availability slot for the authenticated doctor.
   */
  createSlot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const data = createSlotSchema.parse(req.body);
      const slot = await this.service.createSlot(userId, data.start_time, data.end_time);
      res.status(201).json(slot);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Retrieves active AVAILABLE slots for a specified doctor ID.
   */
  getAvailableSlots = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const queryParams = getSlotsQuerySchema.parse(req.query);
      const slots = await this.service.getAvailableSlots(queryParams.doctor_id);
      res.status(200).json(slots);
    } catch (err) {
      next(err);
    }
  };
}

export const slotController = new SlotController();
