export function stringify(x: unknown): string {
  switch (typeof x) {
    case 'object':
      return stringifyObject(x);
    default:
      return '' + x;
  }
}

export function formatMessage(args: unknown[], default_ = ''): string {
  return args.length === 0 ? default_ : args.map(stringify).join(' ');
}

export function registerStringifier(str: Stringifier) {
  stringifiers.push(str);
}

/* Private */

type Stringifier = (value: object) => string | undefined;

const stringifiers: Stringifier[] = [];

function stringifyObject(x: object | null): string {
  if (x === null) return '<null>';
  if (x instanceof Error) {
    return `${x.message}: ${x.name}`;
  }
  if (x instanceof Array) {
    const arr = x;
    return '[ ' + arr.map(elem => stringify(elem)).join(', ') + ' ]';
  }
  for (const str of stringifiers) {
    const s = str(x);
    if (s) return s;
  }
  if ('toString' in x) {
    const s = x.toString();
    if (s !== '[object Object]') return s;
  }
  return JSON.stringify(x);
}
