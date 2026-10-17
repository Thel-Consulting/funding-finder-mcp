#!/usr/bin/env bash
# Secrets scan: gitleaks when installed, plus a grep pass for keys, tokens and email addresses.
set -uo pipefail
cd "$(dirname "$0")/.."
status=0
EXCLUDES=(--glob '!node_modules/**' --glob '!.netlify/**' --glob '!dist/**' --glob '!design/quartz-src/**' --glob '!design/quartz/**' --glob '!package-lock.json')

if command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks $(gitleaks version)"
  if gitleaks dir . --no-banner --redact --exit-code 1 --config scripts/gitleaks.toml; then
    echo "gitleaks: no leaks found"
  else
    echo "gitleaks: findings above"; status=1
  fi
else
  echo "gitleaks not installed; running grep checks only"
fi

# Addresses that may appear: the project security contact, GitHub noreply
# addresses and the reserved example.org/com/net test domains (RFC 2606).
ALLOWED_EMAILS='thel@mail\.grokbot\.com|[A-Za-z0-9._%+-]+@example\.(org|com|net)|[0-9]+\+[A-Za-z0-9-]+@users\.noreply\.github\.com'

check() {
  local label="$1" pattern="$2" allow="${3:-}"
  local hits
  hits=$(rg -n --hidden -e "$pattern" "${EXCLUDES[@]}" --glob '!.git/**' --glob '!scripts/secrets-scan.sh' . || true)
  if [ -n "$allow" ] && [ -n "$hits" ]; then
    # keep a line only if it still matches after removing allowed values
    hits=$(printf '%s\n' "$hits" | while IFS= read -r line; do
      printf '%s\n' "$line" | sed -E "s/$allow//g" | rg -q -e "$pattern" && printf '%s\n' "$line"
    done)
  fi
  if [ -n "$hits" ]; then
    echo "grep: possible $label:"; echo "$hits"; status=1
  else
    echo "grep: no $label"
  fi
}

check "private keys" '-----BEGIN [A-Z ]*PRIVATE KEY-----'
check "AWS keys" 'AKIA[0-9A-Z]{16}'
check "GitHub tokens" 'gh[pousr]_[A-Za-z0-9]{36,}'
check "Slack tokens" 'xox[abprs]-[A-Za-z0-9-]{10,}'
check "Stripe keys" '(sk|rk)_(live|test)_[A-Za-z0-9]{16,}'
check "Cloudflare API tokens" '(CLOUDFLARE_API_TOKEN|CF_API_TOKEN)\s*=\s*\S+'
check "generic secrets" '(api[_-]?key|secret|password|token)\s*[:=]\s*["'"'"'][A-Za-z0-9_\-]{16,}["'"'"']'
check "email addresses" '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' "$ALLOWED_EMAILS"

exit $status
