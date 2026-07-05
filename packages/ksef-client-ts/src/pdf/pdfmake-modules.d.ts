/**
 * Minimal ambient declarations for the two pdfmake browser-build submodules the
 * renderer lazily imports. We deliberately do NOT depend on `@types/pdfmake`:
 * the published DefinitelyTyped package targets the 0.3.x API (promise-based
 * `getBuffer`), which does not match the pinned 0.2.x runtime, and it does not
 * type these `/build/*` submodules usefully anyway. `fonts.ts` narrows the
 * `any` import to the local `PdfMakeLike` shape, so this keeps the `./pdf`
 * public types free of any pdfmake dependency (the "cold module" invariant).
 */
declare module 'pdfmake/build/pdfmake.js';
declare module 'pdfmake/build/vfs_fonts.js';
