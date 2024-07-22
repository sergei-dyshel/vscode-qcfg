import * as callsites from "callsites";
import * as sourceMapSupport from "source-map-support";
import * as nodejs from "./nodejs";

sourceMapSupport.install();

export function getCallsite(frame: number) {
  const site = callsites.default()[frame];
  const jsPos: sourceMapSupport.Position = {
    source: site.getFileName()!,
    line: site.getLineNumber()!,
    column: site.getColumnNumber()!,
  };
  // strip everything before last '.' (happens for callbacks)
  let funcName = site.getFunctionName() ?? "";
  const m = /\.?([^.]+)$/.exec(funcName);
  if (m) funcName = m[1];
  const tsPos = sourceMapSupport.mapSourcePosition(jsPos);
  // show up to 2 elements from path (do not include 'src')
  const { base, dir } = nodejs.path.parse(tsPos.source);
  let filename = base;
  if (dir) {
    const dirbase = nodejs.path.basename(dir);
    if (dirbase !== "src") filename = nodejs.path.join(dirbase, base);
  }
  return {
    location: `${filename}:${tsPos.line}:${tsPos.column}`,
    fileName: filename,
    function: funcName,
  };
}
