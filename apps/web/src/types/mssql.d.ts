// Type shim for mssql — needed because moduleResolution: "bundler" does not
// pick up the package's index.d.ts without an explicit exports.types entry.
// The actual runtime types ship inside the mssql package; this just silences
// the TS2307 "Could not find a declaration file" error at build time.
declare module 'mssql';
