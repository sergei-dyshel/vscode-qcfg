'use strict';

import * as stringFormat from 'string-format';

export const formatString = stringFormat.default;

export function parseNumber(s: string): number;
export function parseNumber(s: string | undefined): number | undefined;
export function parseNumber(s: string | undefined, default_: number): number;
export function parseNumber(
  s: string | undefined,
  default_?: number,
): number | undefined {
  if (s === undefined) return default_;
  const num = Number(s);
  if (isNaN(num) || s === '') throw new Error(`${s} is not a number`);
  return num;
}

export function buildFuzzyPattern(query: string): string {
  const goodChars = query.replace(/\W/g, '');
  return goodChars.split('').join('.*');
}

export function fuzzyMatch(text: string, query: string): boolean {
  return text.search(new RegExp(buildFuzzyPattern(query), 'i')) !== -1;
}

export function buildAbbrevPattern(query: string): string {
  const goodChars = query.replace(/\W/g, '');
  const midPattern = goodChars
    .split('')
    .map(ch => {
      if (ch.match(/[a-zA-Z]/)) {
        const lower = ch.toLowerCase();
        const upper = ch.toUpperCase();
        const anyCase = `(.*[^a-zA-Z])?[${lower}${upper}]`;
        const camelCase = `(.*[^A-Z])?${upper}`;
        return `(${anyCase}|${camelCase})`;
      }
      if (ch.match(/\d+/)) {
        return `(.*[^0-9])?${ch}`;
      }
      return `.*${ch}`;
    })
    .join('');
  return '^' + midPattern + '.*';
}

export function abbrevMatch(text: string, query: string): boolean {
  return text.search(new RegExp(buildAbbrevPattern(query))) !== -1;
}

export function splitWithRemainder(
  str: string,
  regex: RegExp,
  limit: number,
): string[] {
  const result: string[] = [];
  while (str && limit) {
    const match = str.match(regex);
    if (!match || !match.index) {
      result.push(str);
      break;
    }
    if (match[0].length === 0) throw new Error('Empty match inside split');
    result.push(str.substring(0, match.index));
    str = str.substring(match.index + match[0].length);
    limit -= 1;
  }
  if (str || !result) result.push(str);
  return result;
}

export function escapeRegExp(str: string) {
  // from https://stackoverflow.com/a/1144788/5531098
  return str.replace(/([.*+?^=!:${}()|[\]/\\])/g, '\\$1');
}

export function replaceAll(str: string, find: string, replace: string) {
  return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
}

export function ellipsize(
  str: string,
  maxLen: number,
  options?: { delimiter?: string },
): string {
  if (str.length <= maxLen) return str;
  const delimiter = options && options.delimiter ? options.delimiter : '...';
  const left = Math.ceil(maxLen / 2);
  const right = maxLen - left;
  return str.substr(0, left) + delimiter + str.substr(str.length - right);
}

export class TemplateError extends Error {}

export function expandTemplate(
  text: string,
  substitute: { [name: string]: string },
  throwWhenNotExist = false,
): string {
  return text.replace(/\$\{([a-zA-Z0-9]+)\}/g, (_, varname) => {
    const sub = substitute[varname] as string | undefined;
    if (!sub) {
      if (throwWhenNotExist)
        throw new TemplateError(`Could not substitute var "${varname}"`);
      return '';
    }
    return sub;
  });
}
