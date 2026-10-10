import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const host = path.resolve(process.argv[2] || path.join(root, "../N.E.K.O"))
const hosted = path.join(host, "frontend/plugin-manager/src/components/plugin/hosted")
const require = createRequire(import.meta.url)
const { transform } = require("./.tooling/node_modules/sucrase")
const { bundleHostedTsxSource } = await import(pathToFileURL(path.join(hosted, "hostedTsxModule.mjs")))
const source = fs.readFileSync(path.join(root, "ui/panel.tsx"), "utf8")
const compiled = transform(bundleHostedTsxSource(source, [], "ui/panel.tsx"), {
  transforms: ["typescript", "jsx"], jsxPragma: "h", jsxFragmentPragma: "Fragment", production: true,
}).code.replace(/export\s+default\s+function\s+/, "const __Panel = function ")
const runtime = fs.readFileSync(path.join(hosted, "ui-kit/runtime.js"), "utf8")
const styles = fs.readFileSync(path.join(hosted, "ui-kit/styles.css"), "utf8")
const messages = Object.fromEntries(["zh-CN", "en"].map(locale => [
  locale, JSON.parse(fs.readFileSync(path.join(root, `i18n/${locale}.json`), "utf8")),
]))
const actions = [
  "save_exa_key", "remove_exa_key", "clear_exa_key", "test_exa_key",
  "set_anysearch_key", "test_anysearch_key", "clear_anysearch_key",
  "set_key_fallback", "get_host_search", "diagnose_network", "set_ssrf_guard",
].map(id => ({ id }))
const payload = {
  state: {
    exa_keys: [], exa_key_masked: "", exa_key_state: "unknown", anysearch_key_masked: "",
    anysearch_key_state: "none", effective_chain: ["anysearch", "exa", "bing", "baidu"],
    key_fallback: false, proxy_mode: "auto", proxy_detected: false, ssrf_fake_ip: true,
    host_search: { exists: true, running: true }, last_search: {},
  },
  actions, i18n: { locale: "zh-CN", default_locale: "zh-CN", messages },
  locale: "zh-CN", plugin: { id: "better_web_search" },
}
const escapeScript = text => text.replace(/<\/script/gi, "<\\/script")
const boot = `(() => {
${compiled}
const calls = [];
function mount() {
  const props = { ...window.__NEKO_PAYLOAD, ...NekoUiKit, state: window.__NEKO_PAYLOAD.state,
    actions: window.__NEKO_PAYLOAD.actions, api: NekoUiKit.api, t: NekoUiKit.t };
  render(h(__Panel, props), document.getElementById("root"));
}
NekoUiKit.api.refresh = async () => { mount(); return window.__NEKO_PAYLOAD; };
NekoUiKit.api.call = async (id, args) => {
  calls.push({ id, args });
  await new Promise(resolve => setTimeout(resolve, 30));
  const state = window.__NEKO_PAYLOAD.state;
  if (id === "save_exa_key") {
    const card = { fingerprint: "demo" + state.exa_keys.length, masked: "exa****" + args.api_key.slice(-4),
      state: "ok", current: true };
    state.exa_keys.push(card); state.exa_key_masked = card.masked; state.exa_key_state = "valid";
  }
  if (id === "remove_exa_key") {
    state.exa_keys = state.exa_keys.filter(card => card.fingerprint !== args.fingerprint);
    state.exa_key_masked = state.exa_keys[0]?.masked || "";
  }
  if (id === "clear_exa_key") { state.exa_keys = []; state.exa_key_masked = ""; }
  if (id === "set_anysearch_key") {
    state.anysearch_key_masked = "any****" + args.api_key.slice(-4); state.anysearch_key_state = "valid";
  }
  if (id === "clear_anysearch_key") { state.anysearch_key_masked = ""; state.anysearch_key_state = "none"; }
  if (id === "set_key_fallback") state.key_fallback = args.enabled;
  if (id === "set_ssrf_guard") state.ssrf_fake_ip = args.enabled;
  if (id === "get_host_search") return { ok: true, ...state.host_search };
  if (id === "diagnose_network") return { ok: true, summary: window.__NEKO_PAYLOAD.locale === "en"
    ? "Preview: AnySearch and Exa work; Bing did not respond."
    : "预览：AnySearch 与 Exa 可用，Bing 未响应。",
    recommended_chain: ["anysearch", "exa"], rows: [
      { backend: "anysearch", direct: true, proxied: "", ms: 1200, note: "Anonymous" },
      { backend: "exa", direct: true, proxied: "", ms: 2100, note: "Anonymous" },
      { backend: "bing", direct: false, proxied: "", ms: 6000, note: "Timeout" },
    ] };
  return { ok: true, message: "预览：操作成功", count: 3, latency_ms: 800 };
};
window.__preview = { calls, mount, setState(patch) {
  Object.assign(window.__NEKO_PAYLOAD.state, patch); mount();
}, setLocale(locale) {
  window.__NEKO_PAYLOAD.locale = locale; window.__NEKO_PAYLOAD.i18n.locale = locale; mount();
} };
mount();
})();`
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Better Web Search: Offline Preview</title>
<style>${styles}</style></head><body><main id="root"></main>
<script>window.__NEKO_PAYLOAD = ${escapeScript(JSON.stringify(payload))};</script>
<script>${escapeScript(runtime)}</script><script>${escapeScript(boot)}</script></body></html>`
const directory = path.join(root, "tests/artifacts")
fs.mkdirSync(directory, { recursive: true })
const destination = path.join(directory, "panel-preview.html")
fs.writeFileSync(destination, html)
console.log(destination)
