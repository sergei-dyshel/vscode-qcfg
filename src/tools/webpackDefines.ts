/**
 * @file Global variables defined in Webpack NOTE: File must be imported
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-var */
/* eslint-disable vars-on-top */

export {};
declare global {
  var PACKAGE_VERSION: string;
}

globalThis.PACKAGE_VERSION = "ts-node";
// How this works:
// - With webpack, it will assign the value defined with DefinePlugin
// - With ts-node, it will assign the value of itself
globalThis.PACKAGE_VERSION = PACKAGE_VERSION;
