// TODO: rename to string.ts

import { memoizeWithExc } from "./memoize";

export function parseNumber(s: string): number;
export function parseNumber(s: string | undefined): number | undefined;
export function parseNumber(s: string | undefined, default_: number): number;
export function parseNumber(
  s: string | undefined,
  default_?: number,
): number | undefined {
  if (s === undefined) return default_;
  const num = Number(s);
  if (Number.isNaN(num) || s === "") throw new Error(`${s} is not a number`);
  return num;
}

export function buildFuzzyPattern(query: string): string {
  const goodChars = query.replace(/\W/g, "");
  return [...goodChars].join(".*");
}

export function fuzzyMatch(text: string, query: string): boolean {
  return text.search(new RegExp(buildFuzzyPattern(query), "i")) !== -1;
}

export function buildAbbrevPattern(query: string): string {
  const goodChars = query.replace(/\W/g, "");
  const midPattern = [...goodChars]
    .map((ch) => {
      if (/[A-Za-z]/.test(ch)) {
        const lower = ch.toLowerCase();
        const upper = ch.toUpperCase();
        const anyCase = `(.*[^a-zA-Z])?[${lower}${upper}]`;
        const camelCase = `(.*[^A-Z])?${upper}`;
        return `(${anyCase}|${camelCase})`;
      }
      if (/\d+/.test(ch)) {
        return `(.*[^0-9])?${ch}`;
      }
      return `.*${ch}`;
    })
    .join("");
  return "^" + midPattern + ".*";
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
    const match = regex.exec(str);
    if (!match || !match.index) {
      result.push(str);
      break;
    }
    if (match[0].length === 0) throw new Error("Empty match inside split");
    result.push(str.slice(0, Math.max(0, match.index)));
    str = str.slice(Math.max(0, match.index + match[0].length));
    limit -= 1;
  }
  if (str !== "" || result.isEmpty) result.push(str);
  return result;
}

export function escapeRegExp(str: string) {
  // from https://stackoverflow.com/a/1144788/5531098
  return str.replace(/([.*+?^=!:${}()|[\]/\\])/g, "\\$1");
}

export function replaceAll(str: string, find: string, replace: string) {
  return str.replace(new RegExp(escapeRegExp(find), "g"), replace);
}

export function ellipsize(
  str: string,
  maxLen: number,
  options?: { delimiter?: string },
): string {
  if (str.length <= maxLen) return str;
  const delimiter = options?.delimiter ?? "...";
  const left = Math.ceil(maxLen / 2);
  const right = maxLen - left;
  return str.slice(0, left) + delimiter + str.slice(str.length - right);
}

export class TemplateError extends Error {}

export function expandTemplate(
  text: string,
  substitute: Record<string, string | undefined>,
  throwWhenNotExist = false,
): string {
  return text.replace(/\${([a-zA-Z\d]+)}/g, (_, varname: string) => {
    const sub = substitute[varname];
    if (!sub) {
      if (throwWhenNotExist)
        throw new TemplateError(`Could not substitute var "${varname}"`);
      return "";
    }
    return sub;
  });
}

/**
 * Thrown by {@link expandTemplateLiteral} in case of template literal
 * compiling/expanding error
 */
export class TemplateLiteralError extends Error {}

function buildTemplateFunction(keys: string[], template: string) {
  try {
    // convert string to JS syntax and strip quotes, otherwise escape characters
    // used in regexps are lost
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    return new Function(
      ...keys,
      "return `" + JSON.stringify(template).slice(1, -1) + "`;",
    );
  } catch (err) {
    if (err instanceof SyntaxError)
      throw new TemplateLiteralError(
        `Error compiling template '${template}' with vars ${keys}: ${err.message}`,
      );
    throw err;
  }
}

const memoizedBuildTemplateFunction = memoizeWithExc(
  TemplateLiteralError,
  buildTemplateFunction,
);
/**
 * Expand ES6 template literal dynamically
 *
 * NOTE: INSECURE!!! since all global variables/functions are available
 */
export function expandTemplateLiteral(
  template: string,
  vars: Record<string, unknown>,
): string {
  const func = memoizedBuildTemplateFunction(Object.keys(vars), template);
  try {
    return func(...Object.values(vars));
  } catch (err) {
    if (err instanceof ReferenceError)
      throw new TemplateLiteralError(
        `Error expanding template '${template}': ${err.message}`,
      );
    throw err;
  }
}

export {
  camelCase as convCamelCase,
  kebabCase as convKebabCase,
} from "case-anything";
