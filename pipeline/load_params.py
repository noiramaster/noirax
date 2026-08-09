"""Export proprietary pipeline parameters (PIPELINE_PARAMS_JSON) to GITHUB_ENV.

Reads a JSON blob from the PIPELINE_PARAMS_JSON env var (set as a GitHub
Actions secret) and appends KEY=VALUE lines to GITHUB_ENV so the signal
pipeline runs with real values instead of placeholder defaults.

Fails loudly (exit 1) if the secret is missing or has empty values, so the
cron never silently runs with the harmless placeholder defaults.
"""
import json
import os
import sys


def main() -> None:
    raw = os.environ.get("PIPELINE_PARAMS_JSON", "")
    if not raw:
        print(
            "::error::Secret PIPELINE_PARAMS_JSON is not defined. The pipeline "
            "would run with placeholder values (no real signals). Define it in "
            "repo Settings -> Secrets and variables -> Actions.",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        params = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"::error::PIPELINE_PARAMS_JSON is not valid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    if not isinstance(params, dict):
        print("::error::PIPELINE_PARAMS_JSON must be a JSON object", file=sys.stderr)
        sys.exit(1)

    empty = [k for k, v in params.items() if v is None or str(v) == ""]
    if empty:
        print(
            f"::error::PIPELINE_PARAMS_JSON missing values for: {empty}",
            file=sys.stderr,
        )
        sys.exit(1)

    env_file = os.environ.get("GITHUB_ENV")
    if not env_file:
        print("::error::GITHUB_ENV not set — this script must run inside GitHub Actions", file=sys.stderr)
        sys.exit(1)

    with open(env_file, "a", encoding="utf-8") as f:
        for k, v in params.items():
            f.write(f"{k}={v}\n")
    print(f"Loaded {len(params)} pipeline parameters")


if __name__ == "__main__":
    main()
