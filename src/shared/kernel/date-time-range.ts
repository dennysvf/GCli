import { fail, ok, type Result } from "./result";

// Half-open interval [start, end) of instants (architecture 5.8). Two ranges that only touch
// (14:00–14:50 and 14:50–15:00) do not overlap, as in the tstzrange '[)' exclusion constraints.
export class DateTimeRange {
  private constructor(
    readonly start: Date,
    readonly end: Date,
  ) {}

  static of(start: Date, end: Date): Result<DateTimeRange, "EMPTY_RANGE"> {
    if (!(end.getTime() > start.getTime())) return fail("EMPTY_RANGE");
    return ok(new DateTimeRange(new Date(start), new Date(end)));
  }

  static ofMinutes(start: Date, minutes: number): DateTimeRange {
    return new DateTimeRange(new Date(start), new Date(start.getTime() + Math.max(minutes, 1) * 60_000));
  }

  overlaps(other: DateTimeRange): boolean {
    return this.start < other.end && other.start < this.end;
  }

  contains(other: DateTimeRange): boolean {
    return this.start <= other.start && other.end <= this.end;
  }

  get minutes(): number {
    return Math.round((this.end.getTime() - this.start.getTime()) / 60_000);
  }

  shift(minutes: number): DateTimeRange {
    const delta = minutes * 60_000;
    return new DateTimeRange(new Date(this.start.getTime() + delta), new Date(this.end.getTime() + delta));
  }
}
