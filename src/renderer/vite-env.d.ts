/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

/** Generated at build time by aboutPlugin() in electron.vite.config.ts. */
declare module 'virtual:about' {
  export const version: string;
  export const copyright: string;
  /** Text of the app's own LICENSE file. */
  export const licenseText: string;
  export const notices: readonly { name: string; version: string; license: string; url: string; text: string; note?: string }[];
}
