import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prescriptionService, PrescriptionService } from '../services/prescriptionService';

const medicineItemSchema = z.object({
  name: z.string().min(1, 'Medicine name is required'),
  dosage: z.string().min(1, 'Dosage is required'),
  frequency: z.string().min(1, 'Frequency is required'),
  duration_days: z.coerce.number().int().positive('Duration days must be greater than 0'),
});

const createPrescriptionSchema = z.object({
  consultation_id: z.string().uuid({ message: 'consultation_id must be a valid UUID' }),
  diagnosis: z.string().min(1, 'Diagnosis is required'),
  medicines: z.array(medicineItemSchema).min(1, 'At least one medicine is required'),
  advice: z.string().min(1, 'Advice is required'),
});

const prescriptionIdParamSchema = z.object({
  id: z.string().uuid({ message: 'id parameter must be a valid UUID' }),
});

/**
 * Controller handling digital prescriptions issuance and retrieval.
 */
export class PrescriptionController {
  constructor(private service: PrescriptionService = prescriptionService) {}

  /**
   * Issues a digital prescription for a completed or active consultation.
   */
  createPrescription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = createPrescriptionSchema.parse(req.body);
      const userId = req.user!.sub;
      const meta = {
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      };

      const result = await this.service.createPrescription(userId, data, meta);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Retrieves a digital prescription with decrypted diagnosis and medications.
   */
  getPrescription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = prescriptionIdParamSchema.parse(req.params);
      const user = req.user!;
      const meta = {
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      };

      const result = await this.service.getPrescription(id, user, meta);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

export const prescriptionController = new PrescriptionController();
