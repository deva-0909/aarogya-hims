// Exact TINT map from the reference prototype's KPI card helper (the `K()`
// function and its color lookup). Two extra colors (cyan, magenta) are used
// only by Command Center's department counter row, which draws distinct
// colors not in the base KPI palette.
export interface TintColor {
  fg: string;
  bg: string;
}

export const TINT: Record<string, TintColor> = {
  teal: { fg: '#0d8c80', bg: '#dff1ef' },
  blue: { fg: '#2c6ecb', bg: '#e4edfb' },
  indigo: { fg: '#6b4bd6', bg: '#ece8fb' },
  amber: { fg: '#d98412', bg: '#fbeed6' },
  green: { fg: '#1d9a57', bg: '#ddf1e3' },
  red: { fg: '#d64545', bg: '#fbe3e3' },
  slate: { fg: '#51687d', bg: '#eaeef3' },
  cyan: { fg: '#3a8ab0', bg: '#e2f0f6' },
  magenta: { fg: '#c2497a', bg: '#fbe6ef' },
};

export function tint(key: string): TintColor {
  return TINT[key] ?? TINT['teal'];
}
