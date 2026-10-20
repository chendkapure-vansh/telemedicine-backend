import { slotRepository, SlotRepository, Slot } from '../repositories/slotRepository';
import { userRepository, UserRepository } from '../repositories/userRepository';
import { redisClient } from '../config/redis';
import { logger } from '../config/logger';
import { AppError } from '../middlewares/errorHandler';

/**
 * Service managing doctor availability slots with Redis L2 caching.
 */
export class SlotService {
  constructor(
    private slotRepo: SlotRepository = slotRepository,
    private userRepo: UserRepository = userRepository
  ) {}

  /**
   * Creates a new consultation availability slot for a doctor.
   * Invalidates Redis slot cache upon successful creation.
   *
   * @param userId - Authenticated user UUID with DOCTOR role
   * @param startTimeStr - ISO-8601 start timestamp
   * @param endTimeStr - ISO-8601 end timestamp
   * @returns Newly scheduled Slot entity
   */
  async createSlot(
    userId: string,
    startTimeStr: string,
    endTimeStr: string
  ): Promise<Slot> {
    const startTime = new Date(startTimeStr);
    const endTime = new Date(endTimeStr);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      const err = new Error('Invalid ISO date-time format for slot schedule') as AppError;
      err.statusCode = 400;
      throw err;
    }

    if (endTime <= startTime) {
      const err = new Error('Slot end_time must be strictly after start_time') as AppError;
      err.statusCode = 400;
      throw err;
    }

    if (startTime.getTime() <= Date.now()) {
      const err = new Error('Slot start_time must be in the future') as AppError;
      err.statusCode = 400;
      throw err;
    }

    const doctor = await this.userRepo.findDoctorByUserId(userId);
    if (!doctor) {
      const err = new Error(
        'Doctor profile must be configured before scheduling availability slots'
      ) as AppError;
      err.statusCode = 400;
      throw err;
    }

    const hasOverlap = await this.slotRepo.hasOverlappingSlot(
      doctor.id,
      startTime,
      endTime
    );
    if (hasOverlap) {
      const err = new Error(
        'Slot interval overlaps with an existing schedule for this doctor'
      ) as AppError;
      err.statusCode = 409;
      throw err;
    }

    const slot = await this.slotRepo.createSlot(doctor.id, startTime, endTime);

    // Invalidate Redis L2 cache for doctor's active slots
    await this.invalidateDoctorSlotsCache(doctor.id);

    return slot;
  }

  /**
   * Retrieves active AVAILABLE slots for a doctor with Redis caching (TTL = 60s).
   *
   * @param doctorId - Doctor UUID
   * @returns List of active available slots
   */
  async getAvailableSlots(doctorId: string): Promise<Slot[]> {
    const cacheKey = `cache:slots:doctor:${doctorId}`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as Slot[];
      }
    } catch (err) {
      logger.warn({ err, doctorId }, 'Redis cache read error for doctor slots, falling back to database');
    }

    const slots = await this.slotRepo.findAvailableSlotsByDoctorId(doctorId);

    try {
      await redisClient.set(cacheKey, JSON.stringify(slots), 'EX', 60);
    } catch (err) {
      logger.warn({ err, doctorId }, 'Redis cache write error for doctor slots');
    }

    return slots;
  }

  /**
   * Evicts the doctor's available slots from Redis cache.
   *
   * @param doctorId - Doctor UUID
   */
  async invalidateDoctorSlotsCache(doctorId: string): Promise<void> {
    try {
      await redisClient.del(`cache:slots:doctor:${doctorId}`);
    } catch (err) {
      logger.warn({ err, doctorId }, 'Redis cache eviction failed for doctor slots');
    }
  }
}

export const slotService = new SlotService();
