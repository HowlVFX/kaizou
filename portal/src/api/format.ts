const NA = 'N/A';

export function fmtNum(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NA;
  return digits === 0 ? Math.round(value).toLocaleString() : value.toFixed(digits);
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NA;
  return `${(value * 100).toFixed(digits)}%`;
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return 'Never';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? NA : d.toLocaleString();
}

export function fmtLabel(value: string): string {
  return value.replace(/_/g, ' ');
}
