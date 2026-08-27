"""Download a model into the user-data directory for the private runtime."""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Download a Hugging Face model for JIC Hunyuan3D")
    parser.add_argument("--repo-id", required=True)
    parser.add_argument("--local-dir", required=True)
    parser.add_argument("--revision", default=None)
    args = parser.parse_args()

    try:
        from huggingface_hub import HfApi, snapshot_download
    except Exception as exc:
        print(f"Model downloader dependency is unavailable: {exc}", file=sys.stderr, flush=True)
        return 3

    local_dir = Path(args.local_dir).resolve()
    partial_dir = local_dir.with_name(f"{local_dir.name}.partial")
    partial_dir.mkdir(parents=True, exist_ok=True)
    try:
        info = HfApi().model_info(args.repo_id, revision=args.revision)
        total = sum(int(getattr(sibling, "size", 0) or 0) for sibling in (info.siblings or []))
        if total > 0:
            print(f"JIC_TOTAL_BYTES={total}", flush=True)
    except Exception as exc:
        print(f"Unable to read model manifest before download: {exc}", file=sys.stderr, flush=True)

    kwargs = {
        "repo_id": args.repo_id,
        "local_dir": str(partial_dir),
    }
    if args.revision:
        kwargs["revision"] = args.revision
    try:
        snapshot_download(**kwargs)
    except Exception as exc:
        print(f"Model download failed: {exc}", file=sys.stderr, flush=True)
        return 4

    # Keep the adapter's expected path empty until every file is present. A
    # cancelled download can therefore be resumed from the partial directory
    # without being mistaken for an install on the next application launch.
    if local_dir.exists():
        try:
            local_dir.rmdir()
        except OSError:
            print(f"Target model directory is not empty: {local_dir}", file=sys.stderr, flush=True)
            return 5
    partial_dir.replace(local_dir)
    print(f"Model downloaded to {local_dir}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
