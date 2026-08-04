import subprocess
import sys
from pathlib import Path

import psycopg

DSN = "host=localhost port=5433 dbname=postgres user=postgres password=postgres"

COLUMNS = [
    "id",
    "cve_id",
    "date_reserved",
    "description",
    "is_cisa_kev",
    "last_modified_at",
    "published_at",
    "status",
    "title",
    "updated_at",
    "company_id",
]

JQ_FILTER = f".cve_registry[] | [{', '.join('.' + c for c in COLUMNS)}] | @csv"


def find_export() -> Path:
    if len(sys.argv) > 1:
        return Path(sys.argv[1])

    here = Path(__file__).parent
    matches = sorted(here.glob("cve_registry_*.json"))
    if not matches:
        sys.exit(f"No cve_registry_*.json found in {here}. Pass the path explicitly.")
    return matches[-1]


def main() -> None:
    path = find_export()
    if not path.is_file():
        sys.exit(f"Not a file: {path}")

    print(f"Loading {path.name} ({path.stat().st_size / 1e6:.0f} MB)...")

    with psycopg.connect(DSN) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM companies")
            if cur.fetchone()[0] == 0:
                sys.exit(
                    "companies is empty, so the cve_registry.company_id FK "
                    "cannot resolve."
                )

            jq = subprocess.Popen(
                ["jq", "-r", JQ_FILTER, str(path)],
                stdout=subprocess.PIPE,
            )

            cur.execute("TRUNCATE cve_registry")
            copy_sql = (
                f"COPY cve_registry ({', '.join(COLUMNS)}) "
                "FROM STDIN WITH (FORMAT csv)"
            )
            with cur.copy(copy_sql) as copy:
                for chunk in iter(lambda: jq.stdout.read(1 << 20), b""):
                    copy.write(chunk)

            if jq.wait() != 0:
                sys.exit(f"jq exited {jq.returncode}; nothing was committed.")

            cur.execute("SELECT count(*) FROM cve_registry")
            count = cur.fetchone()[0]

        conn.commit()

    print(f"Loaded {count:,} CVEs.")
    print("Run ANALYZE cve_registry; if the planner looks confused.")


if __name__ == "__main__":
    main()
