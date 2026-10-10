"""Run offline tests against the real SDK without booting the host package.

Only the file-logging boundary is replaced. SDK decorators, results and base
classes are real; plugin instances and network calls remain test doubles.
"""

from __future__ import annotations

import argparse
import logging
import sys
import types
from enum import Enum
from pathlib import Path


def prepare_sdk(root: Path) -> None:
    sdk = root / "plugin" / "sdk"
    if not (sdk / "plugin" / "__init__.py").is_file():
        raise SystemExit(f"SDK not found under {root}")
    for name, directory in (("plugin", root / "plugin"), ("plugin.sdk", sdk)):
        namespace = types.ModuleType(name)
        namespace.__path__ = [str(directory)]
        sys.modules[name] = namespace

    class LogLevel(str, Enum):
        TRACE = "TRACE"
        DEBUG = "DEBUG"
        INFO = "INFO"
        WARNING = "WARNING"
        ERROR = "ERROR"
        CRITICAL = "CRITICAL"

    logger = logging.getLogger("isolated-plugin-tests")
    logger.handlers = [logging.NullHandler()]
    logger.propagate = False
    boundary = types.ModuleType("plugin.logging_config")
    boundary.LogLevel = LogLevel
    boundary.get_logger = lambda *_args, **_kwargs: logger
    boundary.logger = logger
    boundary.format_log_text = lambda value, *_args, **_kwargs: str(value)
    for name in ("setup_logging", "configure_default_logger", "intercept_standard_logging"):
        setattr(boundary, name, lambda *_args, **_kwargs: None)
    sys.modules[boundary.__name__] = boundary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sdk-root", type=Path, required=True)
    args, pytest_args = parser.parse_known_args()
    prepare_sdk(args.sdk_root.resolve())
    import pytest

    return pytest.main(pytest_args)


if __name__ == "__main__":
    raise SystemExit(main())
