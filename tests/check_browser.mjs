import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)
const { chromium } = require("playwright")
const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), "artifacts")
const previewUrl = pathToFileURL(path.join(directory, "panel-preview.html")).href
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL })
const labels = {
  "zh-CN": { overview: "概览", settings: "设置", diag: "诊断", optional: "可选增强 · 密钥",
    mode: "免 Key 模式", add: "加一把", save: "保存并使用", run: "开始自检", details: "来源明细",
    summary: "预览：AnySearch 与 Exa 可用，Bing 未响应。" },
  en: { overview: "Overview", settings: "Settings", diag: "Diagnostics", optional: "Optional enhancements · API keys",
    mode: "Keyless mode", add: "Add a key", save: "Save and use", run: "Run the check", details: "Source details",
    summary: "Preview: AnySearch and Exa work; Bing did not respond." },
}
let screenshots = 0

async function checkLayout(page) {
  const issues = await page.evaluate(() => {
    const problems = []
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push("page overflows viewport")
    for (const node of document.querySelectorAll("h1,h3,p,button,input")) {
      const rect = node.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      if (rect.x < -1 || rect.right > innerWidth + 1) problems.push("offscreen: " + node.textContent)
      if (node.matches("button") && node.scrollWidth > node.clientWidth + 2) {
        problems.push("clipped button: " + node.textContent)
      }
    }
    return problems
  })
  assert.deepEqual(issues, [])
}

async function shot(page, name) {
  await page.waitForFunction(() => {
    const page = document.querySelector(".neko-page")
    return page && Number(getComputedStyle(page).opacity) >= 0.99
  })
  await checkLayout(page)
  await page.screenshot({ path: path.join(directory, name + ".png"), fullPage: true })
  screenshots++
}

try {
  for (const locale of ["zh-CN", "en"]) {
    for (const width of [1120, 375, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 850 }, colorScheme: "light" })
      const errors = []
      page.on("pageerror", error => errors.push(error.message))
      await page.goto(previewUrl)
      assert.deepEqual(errors, [])
      await page.evaluate(locale => window.__preview.setLocale(locale), locale)
      const text = labels[locale]
      const copy = await page.evaluate(locale => window.__NEKO_PAYLOAD.i18n.messages[locale], locale)
      assert.equal(await page.getByText(text.mode, { exact: true }).count(), 1)
      assert.equal(await page.locator("input").count(), 0)
      assert.equal(await page.evaluate(() => window.__preview.calls.length), 0)
      assert.equal(await page.locator(".neko-card").count(), 0)
      await shot(page, `overview-${locale}-${width}`)

      await page.getByRole("button", { name: text.settings, exact: true }).click()
      assert.equal(await page.locator("input[type=password]").count(), 0)
      assert.equal(await page.getByRole("button", { name: text.optional }).getAttribute("aria-expanded"), "false")
      await shot(page, `settings-${locale}-${width}`)
      await page.getByRole("button", { name: text.optional }).click()
      assert.equal(await page.locator('input[type=password]').count(), 0)
      await shot(page, `keys-${locale}-${width}`)

      await page.getByRole("button", { name: text.add, exact: true }).first().click()
      await page.locator("input[type=password]").fill("preview-not-a-real-key-9b2c")
      await page.getByRole("button", { name: text.save, exact: true }).click()
      await page.waitForFunction(() => window.__NEKO_PAYLOAD.state.exa_keys.length === 1)
      assert.equal(await page.locator('input[type=password]').count(), 0)
      assert.equal(await page.getByText("exa****9b2c", { exact: true }).count(), 1)
      assert.ok(!(await page.locator("body").innerText()).includes("preview-not-a-real-key"))

      await page.getByRole("button", { name: text.add, exact: true }).first().click()
      await page.locator("input[type=password]").fill("preview-second-key-2c8e")
      await page.getByRole("button", { name: text.save, exact: true }).click()
      await page.waitForFunction(() => window.__NEKO_PAYLOAD.state.exa_keys.length === 2)
      await page.getByRole("button", { name: copy["panel.actions.removeOne"], exact: true }).first().click()
      await page.getByRole("dialog").waitFor()
      await shot(page, `remove-confirm-${locale}-${width}`)
      await page.getByRole("dialog").getByRole("button", { name: copy["panel.actions.cancel"], exact: true }).click()
      assert.equal(await page.evaluate(() => window.__NEKO_PAYLOAD.state.exa_keys.length), 2)
      assert.equal(await page.evaluate(() => window.__preview.calls.filter(call => call.id === "remove_exa_key").length), 0)
      await page.getByRole("button", { name: copy["panel.actions.removeOne"], exact: true }).first().click()
      await page.getByRole("dialog").getByRole("button", { name: copy["panel.confirm.removeOk"], exact: true }).click()
      await page.waitForFunction(() => window.__NEKO_PAYLOAD.state.exa_keys.length === 1)
      assert.equal(await page.getByText("exa****9b2c", { exact: true }).count(), 0)
      await page.getByRole("button", { name: copy["panel.actions.clearAll"], exact: true }).click()
      await page.getByRole("dialog").getByRole("button", { name: copy["panel.confirm.removeOk"], exact: true }).click()
      await page.waitForFunction(() => window.__NEKO_PAYLOAD.state.exa_keys.length === 0)

      await page.getByRole("button", { name: copy["panel.keys.helpTitle"], exact: true }).click()
      await page.getByRole("checkbox", { name: copy["panel.key.fallbackLabel"], exact: true }).check()
      await page.waitForFunction(() => window.__NEKO_PAYLOAD.state.key_fallback === true)
      await page.getByRole("checkbox", { name: copy["panel.key.fallbackLabel"], exact: true }).uncheck()
      await page.waitForFunction(() => window.__NEKO_PAYLOAD.state.key_fallback === false)
      await page.getByRole("checkbox", { name: copy["panel.net.fakeIpLabel"], exact: true }).uncheck()
      await page.waitForFunction(() => window.__NEKO_PAYLOAD.state.ssrf_fake_ip === false)
      await page.getByRole("checkbox", { name: copy["panel.net.fakeIpLabel"], exact: true }).check()
      await page.waitForFunction(() => window.__NEKO_PAYLOAD.state.ssrf_fake_ip === true)

      await page.getByRole("button", { name: text.add, exact: true }).last().click()
      await page.locator("input[type=password]").fill("preview-anysearch-7a1d")
      await page.getByRole("button", { name: text.save, exact: true }).click()
      await page.waitForFunction(() => window.__NEKO_PAYLOAD.state.anysearch_key_masked === "any****7a1d")
      assert.equal(await page.locator('input[type=password]').count(), 0)
      await page.getByRole("button", { name: copy["panel.actions.removeOne"], exact: true }).click()
      await page.getByRole("dialog").getByRole("button", { name: copy["panel.confirm.removeOk"], exact: true }).click()
      await page.waitForFunction(() => window.__NEKO_PAYLOAD.state.anysearch_key_masked === "")

      await page.getByRole("button", { name: text.diag, exact: true }).click()
      await page.getByRole("button", { name: copy["panel.diag.accScope"], exact: true }).click()
      await page.getByRole("checkbox", { name: copy["panel.diag.dual"], exact: true }).check()
      await page.getByRole("button", { name: text.run, exact: true }).click()
      await page.getByText(text.summary, { exact: true }).waitFor()
      assert.equal(await page.getByText(text.summary, { exact: true }).count(), 1)
      assert.equal(await page.evaluate(() => window.__preview.calls.findLast(call => call.id === "diagnose_network").args.with_proxy), true)
      await page.getByRole("button", { name: copy["panel.diag.accScope"], exact: true }).click()
      await page.getByRole("button", { name: text.details, exact: true }).click()
      await shot(page, `diagnostics-${locale}-${width}`)

      await page.getByRole("button", { name: text.overview, exact: true }).click()
      await page.evaluate(() => window.__preview.setState({
        host_search: { exists: false, running: false, error: "unavailable" },
        effective_chain: [],
        last_search: { at: "2026-10-10 10:00:00", ok: false, backend: "", count: 0,
          requested: 3, query_len: 10, attempted: ["anysearch", "exa"],
          ms: 24000, message: "网络超时，稍后重试" },
      }))
      await shot(page, `failed-${locale}-${width}`)
      assert.deepEqual(errors, [])
      await page.close()
    }
  }
  const dark = await browser.newPage({ viewport: { width: 1120, height: 850 }, colorScheme: "dark" })
  await dark.goto(previewUrl)
  await shot(dark, "overview-dark")
  await dark.close()
  fs.writeFileSync(path.join(directory, "browser-check.json"), JSON.stringify({
    ok: true, screenshots, locales: ["zh-CN", "en"], widths: [1120, 375, 320],
    covered: ["no setup gate", "optional keys folded", "masked save", "cancel and confirm removal",
      "clear key pool", "AnySearch removal", "fallback toggle", "fake-IP toggle", "diagnostic proxy option",
      "diagnostic details", "unknown host", "empty effective chain"],
  }, null, 2))
  console.log(`Browser verification passed: ${screenshots} screenshots`)
} finally {
  await browser.close()
}
