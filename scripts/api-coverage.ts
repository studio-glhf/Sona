import { mkdir, writeFile } from "node:fs/promises";
import {
  coverageReport,
  describeParameters,
  listOperations,
} from "../packages/api-library/src/index.js";
const report = coverageReport();
await mkdir("docs/verification", { recursive: true });
await writeFile(
  "docs/verification/api-coverage.json",
  JSON.stringify(report, null, 2) + "\n",
);
const params = listOperations().map((op) => ({
  operationId: op.id,
  fields: describeParameters(op.id),
}));
await writeFile(
  "docs/verification/api-parameters.json",
  JSON.stringify(params, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      denominator: report.denominator,
      summary: report.summary,
      parameters: params.reduce((n, o) => n + o.fields.length, 0),
    },
    null,
    2,
  ),
);
if (report.summary.schemaFailures) process.exitCode = 1;
