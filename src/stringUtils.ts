'use strict';

import {log} from './logging';

export function parseNumber(s: string): number;
export function parseNumber(s: string | undefined): number | undefined;
export function parseNumber(s: string | undefined, default_: number): number;
export function parseNumber(s: string | undefined, default_?: number): number | undefined {
  if (s === undefined)
    return default_;
  const num = Number(s);
  if (isNaN(num) || s === "")
    log.fatal(`${s} is not a number`);
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
  const midPattern = goodChars.split('')
                         .map((ch) => {
                           if (ch.match(/[a-zA-Z]/)) {
                             const lower = ch.toLowerCase();
                             const upper = ch.toUpperCase();
                             const anyCase = `(.*[^a-zA-Z])?[${lower}${upper}]`;
                             const camelCase = `(.*[^A-Z])?${upper}`;
                             return `(${anyCase}|${camelCase})`;
                           } else if (ch.match(/\d+/)) {
                             return `(.*[^0-9])?${ch}`;
                           } else {
                             return `.*${ch}`;
                           }
                         })
                         .join('');
  return '^' + midPattern + '.*';
}

export function abbrevMatch(text: string, query: string): boolean {
  return text.search(new RegExp(buildAbbrevPattern(query))) !== -1;
}

export function splitWithRemainder(
    str: string, regex: RegExp, limit: number): string[] {
  const result: string[] = [];
  while (str && limit) {
    const match = str.match(regex);
    if (!match || !match.index) {
      result.push(str);
      break;
    }
    log.assert(match[0].length > 0, 'Empty match inside split');
    result.push(str.substring(0, match.index));
    str = str.substring(match.index + match[0].length);
    --limit;
  }
  if (str || !result)
    result.push(str);
  return result;
}

export function escapeRegExp(str) {
  // from https://stackoverflow.com/a/1144788/5531098
  return str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
}

export function replaceAll(str: string, find: string, replace: string)
{
  return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
}