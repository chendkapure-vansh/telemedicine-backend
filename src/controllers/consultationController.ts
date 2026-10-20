import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { consultationService, ConsultationService } from '../services/consultationService';

const consultationIdParamSchema = z.object({
  id: z.string().uuid({ message: 'id parameter must be a valid UUID' }),
});

const updateStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED'], {
    errorMap: () => ({ message: "status must be one of ['IN_PROGRESS', 'COMPLETED', 'CANCELLED']" }),
  }),
  notes: z.string().optional(),
});

/**
 * Controller managing consultation lifecycle and status updates.
 */
export class ConsultationController {
  constructor(private service: ConsultationService = consultationService) {}

  /**
   * Retrieves consultation details, decrypting notes for authorized parties.
   */
  getConsultation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = consultationIdParamSchema.parse(req.params);
      const user = req.user!;
      const meta = {
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      };

      const consultation = await this.service.getConsultation(id, user, meta);
      res.status(200).json(consultation);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Updates consultation status through the clinical state machine.
   */
  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = consultationIdParamSchema.parse(req.params);
      const data = updateStatusSchema.parse(req.body);
      const user = req.user!;
      const meta = {
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      };

      const updated = await this.service.updateConsultationStatus(
        id,
        data.status,
        data.notes,
        user,
        meta
      );
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  };
}

export const consultationController = new ConsultationController();
