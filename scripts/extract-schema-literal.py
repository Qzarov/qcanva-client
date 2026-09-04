#!/usr/bin/env python3
"""Print the EXPECTED_SCHEMA string literal from a schema-contract source file.

Deliberately strict. A gate that can be quietly defeated is worse than no gate,
because it manufactures confidence: two genuinely different schemas would
compare as identical and the deploy would proceed.

An earlier version of this took the first regex match anywhere in the file,
which two shapes of perfectly valid TypeScript defeated. A stale or
commented-out `EXPECTED_SCHEMA = "..."` above the real export won by being
first. And `"part one" + "part two"` was truncated to its first segment, so two
different schemas could compare equal.

So this refuses anything it does not fully understand:
  * the assignment must be an `export const`, anchored at the start of a line,
    which a comment cannot be;
  * the literal must be the WHOLE initialiser, terminated by a semicolon, so
    concatenation is rejected rather than silently truncated;
  * more than one match is an error, not a choice.

A template literal or a computed value fails here loudly, which is the right
direction to fail in: the caller stops instead of comparing half a string.
"""

import io
import re
import sys

PATTERN = re.compile(
    r'^export const EXPECTED_SCHEMA\s*(?::\s*string\s*)?=\s*\n?\s*("(?:[^"\\]|\\.)*")\s*;',
    re.M,
)


def main() -> int:
    if len(sys.argv) != 2:
        sys.stderr.write("usage: extract-schema-literal.py <schema-contract.ts>\n")
        return 2
    path = sys.argv[1]
    source = io.open(path, encoding="utf-8").read()
    matches = PATTERN.findall(source)
    if len(matches) != 1:
        sys.stderr.write(
            'expected exactly one `export const EXPECTED_SCHEMA = "...";` in %s, found %d\n'
            % (path, len(matches))
        )
        return 2
    sys.stdout.write(matches[0])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
