import {
  prescriptionRepository,
  PrescriptionRepository,
} from '../repositories/prescriptionRepository';
import {
  consultationRepository,
  ConsultationRepository,
} from '../repositories/consultationRepository';
import {
  userRepository,
  UserRepository,
} from '../repositories/userRepository';
import { encryptPHI, decryptPHI } from '../utils/crypto';
import { auditService, AuditService } from './auditService';
import { TokenPayload } from '../utils/jwt';
import { RequestMetadata } from './consultationService';
import { AppError } from '../middlewares/errorHandler';

export interface MedicineItem {
  name: string;
  dosage: string;
  frequency: string;
  duration_days: number;
}

export interface CreatePrescriptionInput {
  consultation_id: string;
  diagnosis: string;
  medicines: MedicineItem[];
  advice: string;
}

export interface DecryptedPrescription {
  id: string;
  consultation_id: string;
  doctor_id: string;
  patient_id: string;
  diagnosis: string;
  medicines: MedicineItem[];
  advice: string;
  created_at: Date;
}

/**
 * Service managing digital prescriptions, PHI encryption, and audit tracking.
 */
export class PrescriptionService {
  constructor(
    private rxRepo: PrescriptionRepository = prescriptionRepository,
    private consultRepo: ConsultationRepository = consultationRepository,
    private userRepo: UserRepository = userRepository,
    private audit: AuditService = auditService
  ) {}

  /**
   * Creates a digital prescription, encrypting clinical diagnosis and medications using AES-256-GCM.
   *
   * @param userId - Authenticated doctor user UUID
   * @param input - Clinical prescription details
   * @param meta - Request metadata for audit logging
   * @returns Newly issued DecryptedPrescription
   */
  async createPrescription(
    userId: string,
    input: CreatePrescriptionInput,
    meta: RequestMetadata
  ): Promise<DecryptedPrescription> {
    const doctor = await this.userRepo.findDoctorByUserId(userId);
    if (!doctor) {
      const err = new Error('Doctor profile not found') as AppError;
      err.statusCode = 403;
      throw err;
    }

    const consultation = await this.consultRepo.findById(input.consultation_id);
    if (!consultation) {
      const err = new Error('Consultation not found') as AppError;
      err.statusCode = 404;
      throw err;
    }

    // Verify doctor is the treating physician
    if (consultation.doctor_id !== doctor.id) {
      const err = new Error('Forbidden: Only the attending doctor can issue a prescription') as AppError;
      err.statusCode = 403;
      throw err;
    }

    // Ensure consultation is active or completed
    if (consultation.status !== 'IN_PROGRESS' && consultation.status !== 'COMPLETED') {
      const err = new Error(
        `Cannot issue prescription: Consultation must be 'IN_PROGRESS' or 'COMPLETED' (current: '${consultation.status}')`
      ) as AppError;
      err.statusCode = 400;
      throw err;
    }

    // Check if prescription already issued
    const existing = await this.rxRepo.findByConsultationId(consultation.id);
    if (existing) {
      const err = new Error('A digital prescription has already been issued for this consultation') as AppError;
      err.statusCode = 409;
      throw err;
    }

    // Field-level AES-256-GCM encryption of PHI fields
    const encDiagnosis = encryptPHI(input.diagnosis);
    const encMedicines = encryptPHI(JSON.stringify(input.medicines));
    const encAdvice = encryptPHI(input.advice);

    const record = await this.rxRepo.createPrescription(
      consultation.id,
      doctor.id,
      consultation.patient_id,
      encDiagnosis,
      encMedicines,
      encAdvice
    );

    // Record immutable audit event
    await this.audit.log({
      userId,
      action: 'PRESCRIPTION_CREATED',
      resourceType: 'prescriptions',
      resourceId: record.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      id: record.id,
      consultation_id: record.consultation_id,
      doctor_id: record.doctor_id,
      patient_id: record.patient_id,
      diagnosis: input.diagnosis,
      medicines: input.medicines,
      advice: input.advice,
      created_at: record.created_at,
    };
  }

  /**
   * Retrieves a digital prescription by UUID, decrypts diagnosis and drug regimens, and logs audit access.
   *
   * @param id - Prescription UUID
   * @param user - Authenticated user claims
   * @param meta - Request metadata
   * @returns Decrypted digital prescription
   */
  async getPrescription(
    id: string,
    user: TokenPayload,
    meta: RequestMetadata
  ): Promise<DecryptedPrescription> {
    const rx = await this.rxRepo.findById(id);
    if (!rx) {
      const err = new Error('Prescription not found') as AppError;
      err.statusCode = 404;
      throw err;
    }

    const isPatient = rx.patient_id === user.sub;
    const isDoctor = rx.doctor_user_id === user.sub;
    const isAdmin = user.role === 'ADMIN';

    if (!isPatient && !isDoctor && !isAdmin) {
      const err = new Error('Forbidden: You are not authorized to view this prescription') as AppError;
      err.statusCode = 403;
      throw err;
    }

    // Decrypt PHI
    const diagnosis = decryptPHI(rx.diagnosis);
    const medicines = JSON.parse(decryptPHI(rx.medicines)) as MedicineItem[];
    const advice = decryptPHI(rx.advice);

    // Record PHI read audit
    await this.audit.log({
      userId: user.sub,
      action: 'PRESCRIPTION_READ',
      resourceType: 'prescriptions',
      resourceId: id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      id: rx.id,
      consultation_id: rx.consultation_id,
      doctor_id: rx.doctor_id,
      patient_id: rx.patient_id,
      diagnosis,
      medicines,
      advice,
      created_at: rx.created_at,
    };
  }
}

export const prescriptionService = new PrescriptionService();
