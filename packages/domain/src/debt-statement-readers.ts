import { itauDdcStatementReader } from "./debt-statement-itau-ddc";
import {
  type DebtStatement,
  DebtStatementError,
  type DebtStatementReader,
} from "./debt-statements";

/** One reader per bank statement format. A new bank is a new reader here; the engine is unchanged. */
export const debtStatementReaders: DebtStatementReader[] = [itauDdcStatementReader];

/** Reads statement text lines (whitespace is normalized) with the first reader that recognizes them. */
export function readDebtStatement(lines: string[]): DebtStatement {
  const normalized = lines
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => line.length > 0);
  const reader = debtStatementReaders.find((candidate) => candidate.matches(normalized));
  if (!reader) throw new DebtStatementError("UNSUPPORTED_STATEMENT");
  return reader.read(normalized);
}
