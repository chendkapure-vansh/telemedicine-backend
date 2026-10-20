import { query } from '../config/database';

/**
 * Aggregated analytics overview data contract.
 */
export interface AnalyticsOverview {
  total_consultations: number;
  completed_consultations: number;
  total_active_doctors: number;
  gross_revenue_inr: number;
}

/**
 * Repository layer for administrative aggregation metrics.
 */
export class AnalyticsRepository {
  /**
   * Computes platform-wide business metrics in a single aggregation query.
   *
   * @returns Aggregated metrics overview
   */
  async getOverview(): Promise<AnalyticsOverview> {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM consultations) AS total_consultations,
        (SELECT COUNT(*) FROM consultations WHERE status = 'COMPLETED') AS completed_consultations,
        (SELECT COUNT(DISTINCT user_id) FROM doctors) AS total_active_doctors,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'SUCCESS') AS gross_revenue_inr;
    `;

    const res = await query<{
      total_consultations: string;
      completed_consultations: string;
      total_active_doctors: string;
      gross_revenue_inr: string | number;
    }>(sql);

    const row = res.rows[0];

    return {
      total_consultations: parseInt(row?.total_consultations || '0', 10),
      completed_consultations: parseInt(row?.completed_consultations || '0', 10),
      total_active_doctors: parseInt(row?.total_active_doctors || '0', 10),
      gross_revenue_inr: Number(row?.gross_revenue_inr || 0),
    };
  }
}

export const analyticsRepository = new AnalyticsRepository();
