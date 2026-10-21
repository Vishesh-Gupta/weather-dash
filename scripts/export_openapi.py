"""Write the API's OpenAPI schema to openapi.json (used to generate frontend types).

Run with `just openapi`. CI fails if the committed file is out of date.
"""

import json
import sys
from pathlib import Path

from src.api.app import create_app

OUTPUT = Path(__file__).resolve().parents[1] / "openapi.json"


def main() -> int:
    schema = create_app().openapi()
    OUTPUT.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {OUTPUT.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
