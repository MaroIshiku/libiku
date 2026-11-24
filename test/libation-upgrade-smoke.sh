#!/usr/bin/env bash
set -euo pipefail

previous_image=ghcr.io/maroishiku/libiku:v0.2.6@sha256:4883774cc8144249087e79f5d6c4f86800b56c7f5fad844297516fdffdf48ad5
candidate_image=${LIBIKU_SMOKE_IMAGE:-libiku:verify}
smoke_volume=$(docker volume create "libiku-upgrade-smoke-$$-${RANDOM}")
trap 'docker volume rm "$smoke_volume" >/dev/null' EXIT

run_cli() {
  docker run --rm -i --network none --read-only --cap-drop=ALL \
    --security-opt no-new-privileges --tmpfs /tmp:mode=1777 \
    --volume "$smoke_volume:/config" --entrypoint /bin/sh "$1" -eus
}

run_cli "$previous_image" <<'SCRIPT'
  printf '%s\n' '{"Books":"/data","InProgress":"/tmp"}' > /config/Settings.json
  printf "%s\n" "{}" > /config/AccountsSettings.json
  /libation/LibationCli export --path /tmp/library.json --json
  sqlite3 /config/LibationContext.db <<'SQL'
INSERT INTO Books (BookId, AudibleProductId, ContentType, Description, IsAbridged, IsSpatial,
  LengthInMinutes, Locale, Rating_OverallRating, Rating_PerformanceRating, Rating_StoryRating, Subtitle, Title)
VALUES (1, 'B000TEST01', 0, '', 0, 0, 60, 'us', 0, 0, 0, '', 'Synthetic migration book');
INSERT INTO LibraryBooks (BookId, AbsentFromLastScan, Account, DateAdded, IsAudiblePlus, IsDeleted)
VALUES (1, 0, 'test@example.invalid', '2026-01-01T00:00:00', 0, 0);
INSERT INTO UserDefinedItem (BookId, BookStatus, IsFinished, LastDownloadedFormat,
  Rating_OverallRating, Rating_PerformanceRating, Rating_StoryRating, Tags)
VALUES (1, 0, 0, 0, 0, 0, 0, '');
.backup /config/pre-upgrade.db
SQL
SCRIPT

run_cli "$candidate_image" <<'SCRIPT'
  /libation/LibationCli --help 2>&1 | grep -F "LibationCli v14.2.5"
  /libation/LibationCli list-accounts --bare | grep -F "No accounts configured."
  /libation/LibationCli export --path /tmp/library.json --json
  grep -F "Synthetic migration book" /tmp/library.json >/dev/null
  db=/config/LibationContext.db
  test "$(sqlite3 -readonly "$db" "PRAGMA integrity_check;")" = ok
  test "$(sqlite3 -readonly "$db" "SELECT count(*) FROM DownloadHistory;")" = 0
  test "$(sqlite3 -readonly "$db" "SELECT count(*) FROM DownloadAttemptFailures;")" = 0
  test "$(sqlite3 -readonly "$db" "SELECT count(*) FROM Books WHERE BookId = 1 AND Copyright IS NULL;")" = 1
SCRIPT

run_cli "$previous_image" <<'SCRIPT'
  cp /config/pre-upgrade.db /config/LibationContext.db
  /libation/LibationCli export --path /tmp/library.json --json
  grep -F "Synthetic migration book" /tmp/library.json >/dev/null
  test "$(sqlite3 -readonly /config/LibationContext.db "PRAGMA integrity_check;")" = ok
SCRIPT
