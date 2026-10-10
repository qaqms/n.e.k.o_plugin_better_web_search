import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const ts = require("./.tooling/node_modules/typescript")
const host = path.resolve(process.argv[2] || path.join(root, "../N.E.K.O"))
const sdk = path.join(host, "plugin/sdk/hosted-ui")
const program = ts.createProgram([
  path.join(sdk, "globals.d.ts"), path.join(root, "ui/panel.tsx"),
], {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.React,
  jsxFactory: "h",
  jsxFragmentFactory: "Fragment",
  strict: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  noEmit: true,
  skipLibCheck: true,
  baseUrl: root,
  paths: { "@neko/plugin-ui": [sdk] },
})
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root,
    getCanonicalFileName: name => name,
    getNewLine: () => "\n",
  }))
  process.exitCode = 1
} else {
  console.log("Hosted panel: strict TypeScript check passed")
}
