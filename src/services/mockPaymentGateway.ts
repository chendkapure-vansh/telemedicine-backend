import crypto from 'crypto';

/**
 * Result structure returned by payment gateway charge request.
 */
export interface ChargeResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

/**
 * Mock Payment Gateway simulating external payment processing outside database transactions.
 * Prevents blocking DB connection pools during third-party HTTP round-trips.
 */
export class MockPaymentGateway {
  /**
   * Processes a mock payment charge.
   *
   * @param amount - Charge amount in currency minor units or standard units
   * @param currency - Currency code (e.g. 'INR')
   * @param paymentMethod - Payment method (e.g. 'MOCK_CARD')
   * @param cardToken - Token identifying test card (e.g. 'tok_visa_test', 'tok_fail')
   * @returns Charge result with transaction ID or error
   */
  async charge(
    _amount: number,
    _currency: string,
    _paymentMethod: string,
    cardToken?: string
  ): Promise<ChargeResult> {
    // Simulate gateway network roundtrip latency
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Support deterministic testing of payment failure / declined card scenarios
    if (cardToken === 'tok_fail' || cardToken === 'tok_declined') {
      return {
        success: false,
        error: 'Payment declined: card issuer rejected transaction or insufficient funds',
      };
    }

    const transactionId = `txn_${crypto.randomUUID()}`;
    return {
      success: true,
      transactionId,
    };
  }
}

export const mockPaymentGateway = new MockPaymentGateway();
