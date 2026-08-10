// Accepts Prisma.Decimal, plain numbers/strings, or any object exposing
// toString() (e.g. the lightweight structural `Money` type used by
// FinancialPositionView so it doesn't need to import Prisma's runtime type).
export function formatCurrency(value: { toString(): string } | number): string {
  const num = typeof value === "object" ? Number(value.toString()) : Number(value);
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(num);
}

export function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
