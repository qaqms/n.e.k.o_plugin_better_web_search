"""Opt-in live probe. No host imports, saved keys or configuration writes."""

from __future__ import annotations

import json
import time

import conftest

providers = conftest.load("_providers")
net = conftest.load("_net")


def main() -> None:
    query = "N.E.K.O 猫娘计划 开源"
    options = {"timeout": 8.0, "policy": net.POLICY_NONE, "proxy_url": ""}
    for name in ("anysearch", "exa", "bing", "baidu"):
        start = time.monotonic()
        try:
            if name == "anysearch":
                hits = providers.search_anysearch(query, 3, api_key="", **options)
            elif name == "exa":
                hits = providers.search_exa(query, 3, api_key="", **options)
            else:
                hits = providers.search_html(providers.PROVIDERS[name], query, 3, **options)
            record = {"backend": name, "ok": bool(hits), "count": len(hits),
                      "first_url": hits[0]["url"] if hits else ""}
        except Exception as error:
            record = {"backend": name, "ok": False, "error": type(error).__name__,
                      "message": str(error)[:180]}
        record["ms"] = round((time.monotonic() - start) * 1000)
        print(json.dumps(record, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    main()
