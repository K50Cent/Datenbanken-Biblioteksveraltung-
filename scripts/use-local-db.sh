#!/usr/bin/env sh
set -eu

cp .env.local.example .env
echo "DynamoDB Local ist in .env aktiviert."
echo "Naechster Schritt:"
echo "  Docker Desktop starten"
echo "  DynamoDB Local auf Port 8000 starten"
echo "  npm run setup-users"
echo "  npm run dev"
