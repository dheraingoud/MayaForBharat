// Source: bolt.diy/app/utils/stripIndent.ts
// Supports both regular function call and tagged template literal usage

export function stripIndent(str: string): string;
export function stripIndent(strings: TemplateStringsArray, ...values: any[]): string;
export function stripIndent(strOrStrings: string | TemplateStringsArray, ...values: any[]): string {
  // If called as a tagged template literal
  let str: string;
  if (typeof strOrStrings === 'string') {
    str = strOrStrings;
  } else {
    // Tagged template: interleave strings and values
    str = strOrStrings.reduce((result, string, i) => {
      return result + string + (i < values.length ? String(values[i]) : '');
    }, '');
  }

  const match = str.match(/^[ \t]*(?=\S)/gm);

  if (!match) {
    return str;
  }

  const indent = Math.min(...match.map((el) => el.length));
  const re = new RegExp(`^[ \\t]{${indent}}`, 'gm');

  return indent > 0 ? str.replace(re, '') : str;
}

// Alias for backward compatibility (bolt.diy uses both forms)
export const stripIndents = stripIndent;
