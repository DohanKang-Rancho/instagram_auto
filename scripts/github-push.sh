#!/bin/bash
# GitHub 저장소 생성 후 한 번만 실행하세요.
# 사용법: ./scripts/github-push.sh <GitHub사용자명>/<저장소명>
# 예: ./scripts/github-push.sh myname/insta

set -e
REPO="${1:?Usage: $0 <owner/repo>}"
git remote add origin "https://github.com/${REPO}.git" 2>/dev/null || git remote set-url origin "https://github.com/${REPO}.git"
git push -u origin main
echo "Push 완료. Cloudflare Pages에 저장소를 연결하면 자동 배포됩니다."
