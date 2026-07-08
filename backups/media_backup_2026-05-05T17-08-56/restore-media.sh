#!/bin/bash
# Script de restauration des médias pour MyJantes
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "=== Restauration des médias MyJantes ==="
mkdir -p uploads
for file in "$SCRIPT_DIR"/*; do
  filename=$(basename "$file")
  if [[ "$filename" != "restore-media.sh" && "$filename" != "media_mapping.json" && "$filename" != "media_tables.sql" ]]; then
    cp "$file" uploads/
  fi
done
echo "Fichiers restaurés dans uploads/"
echo "=== Restauration terminée ==="