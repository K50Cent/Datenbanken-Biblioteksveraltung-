#!/usr/bin/env sh
set -eu

PROFILE="${AWS_PROFILE:-bibliothek}"

cp .env.aws.example .env

echo "Pruefe AWS Profil: $PROFILE"
aws sts get-caller-identity --profile "$PROFILE"

echo "Erstelle DynamoDB Tabellen in AWS..."
npm run create-tables

echo "Spiele Testdaten in AWS DynamoDB ein..."
npm run seed

echo "AWS DynamoDB ist vorbereitet."
echo "App starten mit: npm run dev"
