# AWS DynamoDB Cloud Setup

Dieses Projekt enthaelt nur noch die DynamoDB-Verbindung.

## AWS CLI Profil

Die Verbindung nutzt das Profil aus `.env`:

```env
AWS_REGION=eu-central-1
AWS_PROFILE=bibliothek
```

Profil pruefen:

```bash
aws sts get-caller-identity --profile bibliothek
```

## AWS SSO

```bash
aws configure sso --profile bibliothek
aws sso login --profile bibliothek
```

## Zurueck auf lokale DynamoDB

```bash
npm run use-local-db
```
