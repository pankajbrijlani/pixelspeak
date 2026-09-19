export function formatMoney(amount: number | { toString(): string }, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(Number(amount));
}
