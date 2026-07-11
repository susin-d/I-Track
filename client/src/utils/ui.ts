export const cx = (...values: (string | false | undefined)[]) =>
  values.filter(Boolean).join(" ");

export const fmt = (value: string) =>
  value.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
