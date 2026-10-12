"use client";

import { Stamp } from "@/shared/ui/components/stamp";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/components/table";
import { cn } from "cn";
import type { ViewCell, ViewColumn } from "../application/reports/format";

function Cell({ cell }: { cell: ViewCell | undefined }) {
  if (cell === undefined) return null;
  if (typeof cell === "string") return <>{cell}</>;
  return <Stamp variant={cell.tone}>{cell.text}</Stamp>;
}

const alignClass = (column: ViewColumn) =>
  cn(column.align === "right" && "text-right tabular-nums", column.kind === "date" && "tabular-nums");

// A result table (design system 5.4): no vertical rules, amounts right-aligned in tabular numerals,
// the first column as the identifier and, optionally, the totals row under the double rule.
export function ReportTable({
  caption,
  columns,
  rows,
  totals,
}: {
  caption: string;
  columns: ViewColumn[];
  rows: Record<string, ViewCell>[];
  totals?: Record<string, string[]>;
}) {
  return (
    <Table>
      <caption className="sr-only">{caption}</caption>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.key} scope="col" className={cn(column.align === "right" && "text-right")}>
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={index}>
            {columns.map((column, position) => (
              <TableCell
                key={column.key}
                className={cn(alignClass(column), position === 0 && "font-semibold")}
              >
                <Cell cell={row[column.key]} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      {totals ? (
        <TableFooter>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.key} className={alignClass(column)}>
                {(totals[column.key] ?? []).map((line, index) => (
                  <div key={index}>{line}</div>
                ))}
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      ) : null}
    </Table>
  );
}
