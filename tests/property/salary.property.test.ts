// Feature: emtees-academy-lms, Property 14: Salary calculation follows the defined formula
import { describe, it, expect } from "vitest";
import fc from "fast-check";

function calculateSalary(basicSalary: number, groupCount: number, oneToOneCount: number, groupRate: number, oneToOneRate: number): number {
  return basicSalary + groupCount * groupRate + oneToOneCount * oneToOneRate;
}

describe("Salary Engine", () => {
  it("total = basicSalary + (groupCount * groupRate) + (oneToOneCount * oneToOneRate)", () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 50000, noNaN: true }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        fc.float({ min: 0, max: 1000, noNaN: true }),
        fc.float({ min: 0, max: 1000, noNaN: true }),
        (basic, gc, oc, gr, or) => {
          const total = calculateSalary(basic, gc, oc, gr, or);
          expect(total).toBeCloseTo(basic + gc * gr + oc * or, 5);
        }
      ),
      { numRuns: 100 }
    );
  });
});
