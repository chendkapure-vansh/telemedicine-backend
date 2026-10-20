import {
  consultationRepository,
  ConsultationRepository,
  ConsultationRecord,
} from '../repositories/consultationRepository';
import { encryptPHI, decryptPHI } from '../utils/crypto';
import { auditService, AuditService } from './auditService';
import { TokenPayload } from '../utils/jwt';
import { AppError } from '../middlewares/errorHandler';

export interface RequestMetadata {
  ip?: string;
  userAgent?: string;
}

/**
 * Service managing consultation lifecycle transitions and access control.
 */
export class ConsultationService {
  constructor(
    private consultRepo: ConsultationRepository = consultationRepository,
    private audit: AuditService = auditService
  ) {}

  /**
   * Retrieves consultation details, decrypts clinical notes, and logs audit access.
   *
   * @param id - Consultation UUID
   * @param user - Authenticated user claims
   * @param meta - Request IP and User-Agent
   * @returns Decrypted consultation entity
   */
  async getConsultation(
    id: string,
    user: TokenPayload,
    meta: RequestMetadata
  ): Promise<ConsultationRecord> {
    const consultation = await this.consultRepo.findById(id);
    if (!consultation) {
      const err = new Error('Consultation not found') as AppError;
      err.statusCode = 404;
      throw err;
    }

    // Access control: Patient, Treating Doctor, or Admin only
    const isPatient = consultation.patient_id === user.sub;
    const isDoctor = consultation.doctor_user_id === user.sub;
    const isAdmin = user.role === 'ADMIN';

    if (!isPatient && !isDoctor && !isAdmin) {
      const err = new Error('Forbidden: You are not authorized to view this consultation') as AppError;
      err.statusCode = 403;
      throw err;
    }

    // Decrypt clinical notes (PHI)
    const decryptedNotes = consultation.notes ? decryptPHI(consultation.notes) : null;

    // Log PHI access to immutable audit trail
    await this.audit.log({
      userId: user.sub,
      action: 'CONSULTATION_READ',
      resourceType: 'consultations',
      resourceId: id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      ...consultation,
      notes: decryptedNotes,
    };
  }

  /**
   * Transitions consultation state according to clinical state machine rules.
   *
   * @param id - Consultation UUID
   * @param targetStatus - Target state ('IN_PROGRESS' | 'COMPLETED' | 'CANCELLED')
   * @param notes - Optional clinical notes
   * @param user - Authenticated user claims
   * @param meta - Request metadata
   * @returns Updated consultation record
   */
  async updateConsultationStatus(
    id: string,
    targetStatus: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
    notes: string | undefined,
    user: TokenPayload,
    meta: RequestMetadata
  ): Promise<ConsultationRecord> {
    const consultation = await this.consultRepo.findById(id);
    if (!consultation) {
      const err = new Error('Consultation not found') as AppError;
      err.statusCode = 404;
      throw err;
    }

    const isPatient = consultation.patient_id === user.sub;
    const isDoctor = consultation.doctor_user_id === user.sub;
    const isAdmin = user.role === 'ADMIN';

    // Authorization checks
    if (targetStatus === 'CANCELLED') {
      if (!isPatient && !isDoctor && !isAdmin) {
        const err = new Error('Forbidden: You are not authorized to cancel this consultation') as AppError;
        err.statusCode = 403;
        throw err;
      }
    } else {
      // IN_PROGRESS and COMPLETED transitions must be executed by the treating doctor or admin
      if (!isDoctor && !isAdmin) {
        const err = new Error('Forbidden: Only the assigned doctor can update consultation progress') as AppError;
        err.statusCode = 403;
        throw err;
      }
    }

    // State machine transitions: SCHEDULED -> IN_PROGRESS -> COMPLETED / CANCELLED
    const current = consultation.status;
    if (current === 'COMPLETED' || current === 'CANCELLED') {
      const err = new Error(
        `Invalid state transition: Consultation is in terminal state '${current}'`
      ) as AppError;
      err.statusCode = 400;
      throw err;
    }

    if (current === 'SCHEDULED') {
      if (targetStatus !== 'IN_PROGRESS' && targetStatus !== 'CANCELLED') {
        const err = new Error(
          `Invalid state transition: Cannot jump directly from 'SCHEDULED' to '${targetStatus}'`
        ) as AppError;
        err.statusCode = 400;
        throw err;
      }
    } else if (current === 'IN_PROGRESS') {
      if (targetStatus !== 'COMPLETED' && targetStatus !== 'CANCELLED') {
        const err = new Error(
          `Invalid state transition: 'IN_PROGRESS' consultation can only be transitioned to 'COMPLETED' or 'CANCELLED'`
        ) as AppError;
        err.statusCode = 400;
        throw err;
      }
    }

    // Encrypt notes if provided
    const encryptedNotes = notes ? encryptPHI(notes) : null;
    const updated = await this.consultRepo.updateStatus(id, targetStatus, encryptedNotes);

    // Record audit log
    await this.audit.log({
      userId: user.sub,
      action: 'CONSULTATION_STATE_CHANGE',
      resourceType: 'consultations',
      resourceId: id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        previousStatus: current,
        newStatus: targetStatus,
      },
    });

    return {
      ...updated,
      notes: notes || (updated.notes ? decryptPHI(updated.notes) : null),
    };
  }
}

export const consultationService = new ConsultationService();
