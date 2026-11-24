#!/bin/sh
set -eu

case "${1:-}" in
  --help)
    echo "LibationCli v13.7.5-container-smoke"
    ;;
  list-accounts)
    if [ -f "${LIBATION_FILES_DIR}/fake-connected" ]; then
      printf 'container-smoke@example.invalid\tSynthetic account\tde\tyes\tyes\n'
    else
      echo "No accounts configured."
    fi
    ;;
  liberate)
    printf 'Synthetic CLI arguments: %s\n' "$*"
    ;;
  login-external)
    echo "Open this URL in your web browser and sign in:"
    echo "https://www.amazon.de/ap/signin?state=synthetic-container-state"
    echo "After signing in, paste the final browser URL."
    printf "Paste URL: "
    IFS= read -r response_url
    sleep 2
    case "${response_url}" in
      https://www.amazon.de/ap/maplanding?*)
        : > "${LIBATION_FILES_DIR}/fake-connected"
        echo "Successfully authenticated synthetic account."
        ;;
      *)
        echo "Synthetic response rejected." >&2
        exit 3
        ;;
    esac
    ;;
  *)
    exit 0
    ;;
esac
