import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

const requiredRoutes = [
  "src/app/(app)/dashboard/page.tsx",
  "src/app/(app)/expedients/page.tsx",
  "src/app/(app)/documents/page.tsx",
  "src/app/(app)/digitization/page.tsx",
  "src/app/(app)/trd/page.tsx",
  "src/app/(app)/archives/page.tsx",
  "src/app/(app)/archive/page.tsx",
  "src/app/(app)/kardex/page.tsx",
  "src/app/(app)/transfer-batches/page.tsx",
  "src/app/(app)/transfers/page.tsx",
  "src/app/(app)/reception/page.tsx",
  "src/app/(app)/loans/page.tsx",
  "src/app/(app)/inventory/page.tsx",
  "src/app/(app)/locations/page.tsx",
  "src/app/(app)/correspondence/page.tsx",
  "src/app/(app)/hr/page.tsx",
  "src/app/(app)/recruitment/page.tsx",
  "src/app/(app)/sst/exams/page.tsx",
  "src/app/(app)/medical/page.tsx",
  "src/app/(app)/sst/alerts/page.tsx",
  "src/app/(app)/bi/page.tsx",
  "src/app/(app)/audit/page.tsx",
  "src/app/(app)/security/page.tsx",
  "src/app/(app)/settings/page.tsx",
  "src/app/empleo/page.tsx",
];

describe("official AMBAR screen map", () => {
  it("keeps every required production route implemented", () => {
    const missing = requiredRoutes.filter((route) => !existsSync(join(process.cwd(), route)));
    expect(missing).toEqual([]);
  });
});
