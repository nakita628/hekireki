// Vite's `?worker` import: the module's default export constructs the bundled worker.
// (An ambient wildcard module has to live in a script file, so this one is not linted.)
declare module '*?worker' {
  const WorkerFactory: new () => Worker
  export default WorkerFactory
}
