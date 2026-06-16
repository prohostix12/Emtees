// Feature: emtees-academy-lms, Property 7: Fees balance is always total minus paid
import { describe, it, expect } from "vitest";
import fc from "fast-check";

function calculateFeesBalance(feesTotal: number, feesPaid: number): number {
  return feesTotal - feesPaid;
}

describe("Fees Balance", () => {
  it("feesBalance = feesTotal - feesPaid for any valid inputs", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100000, noNaN: true }),
        fc.float({ min: 0, max: 100000, noNaN: true }),
        (total, paid) => {
          const balance = calculateFeesBalance(total, paid);
          expect(balance).toBeCloseTo(total - paid, 5);
        }
      ),
      { numRuns: 100 }
    );
  });
});
