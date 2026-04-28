#!/usr/bin/env sh
set -eu

cp .env.local.example .env
echo "DynamoDB Local ist in .env aktiviert."
echo "Naechster Schritt:"
echo "  Docker Desktop starten"
echo "  npm run setup-db"
echo "  npm run dev"
