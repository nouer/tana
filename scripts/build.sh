#!/bin/bash
cd "$(dirname "$0")/.."

set -euo pipefail

# Worktreeを複数同時に動かしても衝突しないように、Composeのプロジェクト名をパスから安定生成する。
if [ -z "${COMPOSE_PROJECT_NAME:-}" ]; then
  if command -v python3 >/dev/null 2>&1; then
    export COMPOSE_PROJECT_NAME="tana_$(python3 - <<'PY'
import hashlib, os
print(hashlib.sha1(os.getcwd().encode('utf-8')).hexdigest()[:10])
PY
)"
  fi
fi

# Worktreeごとのネットワーク衝突を避けるため、サブネットと固定IPをプロジェクト単位で自動生成する。
if [ -z "${TANA_SUBNET:-}" ] || [ -z "${TANA_APP_IP:-}" ]; then
  if command -v python3 >/dev/null 2>&1; then
    eval "$(python3 - <<'PY'
import hashlib, os
proj = os.environ.get("COMPOSE_PROJECT_NAME") or hashlib.sha1(os.getcwd().encode("utf-8")).hexdigest()[:10]
h = hashlib.sha1(proj.encode("utf-8")).hexdigest()
oct3 = (int(h[:4], 16) % 200) + 20  # 20..219
subnet = f"172.33.{oct3}.0/24"
ip = f"172.33.{oct3}.10"
print(f'export TANA_SUBNET="{subnet}"')
print(f'export TANA_APP_IP="{ip}"')
PY
)"
  fi
fi

# デフォルトは 8088。必要なら TANA_PORT を指定する。
TANA_PORT="${TANA_PORT:-8088}"

# PWA アイコン生成（PNG が存在しない場合のみ）
if [ ! -f "local_app/icons/icon-512.png" ]; then
  if [ -f "scripts/generate-icons.sh" ]; then
    echo "Generating PWA icons..."
    bash scripts/generate-icons.sh
  fi
fi

# スプラッシュ画像生成（17ファイル揃っていない場合に再生成）
if [ ! -d "local_app/icons/splash" ] || [ "$(find local_app/icons/splash -name 'splash-*.png' | wc -l)" -lt 17 ]; then
  if [ -f "scripts/generate_splash.py" ]; then
    echo "Generating splash images..."
    python3 scripts/generate_splash.py
  fi
fi

./scripts/generate_version.sh
echo "Building and starting containers..."
docker compose build tana-app-public
docker compose up -d tana-app tana-app-public
echo "Done! App is running at http://localhost:${TANA_PORT}"
