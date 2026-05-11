#!/usr/bin/env sh
set -eu

cp .env.aws.example .env
echo "AWS DynamoDB Cloud ist in .env aktiviert."
echo "Naechster Schritt:"
echo "  aws sts get-caller-identity --profile bibliothek"
echo "  npm run setup-users"
echo "  npm run dev"
