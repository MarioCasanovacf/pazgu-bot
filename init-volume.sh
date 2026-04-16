#!/bin/bash
set -e

echo "🤖 Initializing volume..."

mkdir -p /data/agent /data/sessions /data/baileys-auth /data/messages /data/images

# Always update AGENTS.md from app bundle (personality lives in code)
cp /app/agent/AGENTS.md /data/agent/ 2>/dev/null || true

# Baileys auth — restore from base64 env var if dir is empty
if [ -z "$(ls -A /data/baileys-auth 2>/dev/null)" ] && [ -n "$BAILEYS_AUTH_B64" ]; then
  echo "$BAILEYS_AUTH_B64" | base64 -d | tar xzf - -C /data/baileys-auth
  echo "🤖 Baileys auth restored from env var"
fi

echo "🤖 Volume ready."
