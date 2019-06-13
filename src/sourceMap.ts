import * as sourceMapSupport from 'source-map-support';
import * as callsites from 'callsites';
import * as path from 'path';

sourceMapSupport.install();

export function getCallsite(frame: number) {
  const site = callsites.default()[frame];
  const jsPos: sourceMapSupport.Position = {
    source: site.getFileName()!,
    line: site.getLineNumber()!,
    column: site.getColumnNumber()!
  };
  // strip everything before last '.' (happens for callbacks)
  let funcName = site.getFunctionName() || '';
  const m = funcName.match(/\.?([^.]+)$/);
  if (m)
    funcName = m[1];
  const tsPos = sourceMapSupport.mapSourcePosition(jsPos);
  const basename = path.basename(tsPos.source);
  return {
    location: `${basename}:${tsPos.line}:${tsPos.column}`,
    fileName: basename,
    function: funcName
  };
}
