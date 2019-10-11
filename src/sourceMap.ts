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
  // show up to 2 elements from path (do not include 'src')
  const {base, dir} = path.parse(tsPos.source);
  let filename = base;
  if (dir) {
    const dirbase = path.basename(dir);
    if (dirbase !== 'src')
      filename = path.join(dirbase, base);
  }
  return {
    location: `${filename}:${tsPos.line}:${tsPos.column}`,
    fileName: filename,
    function: funcName
  };
}
