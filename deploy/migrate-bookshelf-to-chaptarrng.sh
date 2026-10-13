#!/usr/bin/env bash
set -euo pipefail
umask 077

CONFIG_DIR="${BOOKSHELF_EBOOKS_CONFIG_DIR:-}"
IMAGE="${CHAPTARRNG_MIGRATION_IMAGE:-ghcr.io/snapetech/chaptarrng:latest}"
BACKUP_DIR="${BACKUP_DIR:-${HOME}/bookshelfng-migration-backups}"
APPLY=false
CONFIRM_STOPPED=false

usage() {
  cat <<'EOF'
Usage: migrate-bookshelf-to-chaptarrng.sh [--config-dir PATH] [--image IMAGE] [--apply --confirm-stopped]

Preview a migration with the ordinary ChaptarrNG image. Preview is the default
and does not change the source database. Applying requires an independent
config backup and confirmation that BookshelfNG is stopped. The helper does
not start the new service or change its deployment file. If the source has
records without enough media information, preview writes a review file beside
readarr.db; complete its mediaType choices and save it as the matching map file.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --config-dir)
      [ "$#" -ge 2 ] || { echo "--config-dir needs a path." >&2; exit 2; }
      CONFIG_DIR="$2"
      shift
      ;;
    --image)
      [ "$#" -ge 2 ] || { echo "--image needs an image reference." >&2; exit 2; }
      IMAGE="$2"
      shift
      ;;
    --apply)
      APPLY=true
      ;;
    --confirm-stopped)
      CONFIRM_STOPPED=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$APPLY" = "true" ] && [ "$CONFIRM_STOPPED" != "true" ]; then
  echo "Apply requires --confirm-stopped. Stop every BookshelfNG process using this data first." >&2
  exit 2
fi

if [ "$APPLY" != "true" ] && [ "$CONFIRM_STOPPED" = "true" ]; then
  echo "--confirm-stopped is only valid with --apply." >&2
  exit 2
fi

if [ ! -d "$CONFIG_DIR" ] || [ ! -f "${CONFIG_DIR}/readarr.db" ]; then
  echo "Set BOOKSHELF_EBOOKS_CONFIG_DIR or pass --config-dir with the BookshelfNG config path containing readarr.db. No data was changed." >&2
  exit 2
fi

CONFIG_DIR="$(cd -- "$CONFIG_DIR" && pwd -P)"

AUDIOBOOKS_CONFIG_DIR="${BOOKSHELF_AUDIOBOOKS_CONFIG_DIR:-}"
if [ -n "$AUDIOBOOKS_CONFIG_DIR" ] && [ -d "$AUDIOBOOKS_CONFIG_DIR" ]; then
  AUDIOBOOKS_CONFIG_DIR="$(cd -- "$AUDIOBOOKS_CONFIG_DIR" && pwd -P)"
fi
if [ -n "$AUDIOBOOKS_CONFIG_DIR" ] && [ "$AUDIOBOOKS_CONFIG_DIR" != "$CONFIG_DIR" ] && [ -f "${AUDIOBOOKS_CONFIG_DIR}/readarr.db" ]; then
  echo "A second audiobook database exists at ${AUDIOBOOKS_CONFIG_DIR}. This helper will not merge split libraries." >&2
  exit 2
fi

command -v docker >/dev/null 2>&1 || { echo "Docker is required to run the ChaptarrNG migration utility." >&2; exit 2; }
command -v stat >/dev/null 2>&1 || { echo "stat is required to preserve the config directory owner." >&2; exit 2; }

if [ "$APPLY" = "true" ]; then
  command -v realpath >/dev/null 2>&1 || { echo "realpath is required to keep the backup outside the source directory." >&2; exit 2; }
  backup_dir_candidate="$(realpath -m -- "$BACKUP_DIR")"
  case "$backup_dir_candidate/" in
    "$CONFIG_DIR/"*)
      echo "BACKUP_DIR must be outside the BookshelfNG config directory." >&2
      exit 2
      ;;
  esac
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  backup_dir_real="$(cd -- "$BACKUP_DIR" && pwd -P)"
  case "$backup_dir_real/" in
    "$CONFIG_DIR/"*)
      echo "BACKUP_DIR must be outside the BookshelfNG config directory." >&2
      exit 2
      ;;
  esac
  backup_path="${backup_dir_real}/bookshelfng-config-$(date +%Y%m%d-%H%M%S)-$$.tar.gz"
  tar -C "$(dirname "$CONFIG_DIR")" -czf "$backup_path" "$(basename "$CONFIG_DIR")"
  chmod 600 "$backup_path"
  echo "Independent config backup: ${backup_path}"
  migration_flag=-migrate-bookshelf
else
  migration_flag=-preview-bookshelf-migration
fi

owner="$(stat -c '%u:%g' "$CONFIG_DIR")"
if docker run --rm \
  --network none \
  --user "$owner" \
  --mount "type=bind,source=${CONFIG_DIR},target=/config" \
  --entrypoint dotnet \
  "$IMAGE" \
  /app/Chaptarr.dll "$migration_flag" -data=/config; then
  :
else
  migration_status=$?
  media_review="${CONFIG_DIR}/readarr.db.bookshelf-media-review.json"
  media_map="${CONFIG_DIR}/readarr.db.bookshelf-media-map.json"
  if [ -f "$media_review" ] && [ ! -f "$media_map" ]; then
    echo "Migration needs explicit per-book media choices. Review ${media_review}, set each mediaType to audiobook, ebook, or both, and save it as ${CONFIG_DIR}/readarr.db.bookshelf-media-map.json. Then rerun preview." >&2
    echo "The converter did not promote the staged database. Keep BookshelfNG stopped before applying." >&2
  fi
  exit "$migration_status"
fi

if [ "$APPLY" = "true" ]; then
  cat <<EOF
Database conversion completed. The ChaptarrNG converter also retained the original readarr.db beside the converted database.
Point the service at the same config directory and media/download mounts, then use the regular ChaptarrNG image: ${IMAGE}
Preserve the old configured port and URL base. Review provider credentials and other environment-only settings before starting the new service.
EOF
else
  cat <<EOF
Preview completed without changing readarr.db. Review the table report above, then stop BookshelfNG and run this command with --apply --confirm-stopped.
The regular ChaptarrNG image is used for both preview and apply: ${IMAGE}
EOF
fi
