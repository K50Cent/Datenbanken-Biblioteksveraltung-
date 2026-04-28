# AWS DynamoDB Cloud Setup

Dieses Projekt kann lokal mit DynamoDB Local oder cloudbasiert mit AWS DynamoDB laufen.

## Aktueller Stand

Der Code ist vorbereitet fuer beide Modi:

- Lokal: `.env` enthaelt `DYNAMODB_ENDPOINT=http://localhost:8000`
- AWS Cloud: `.env` enthaelt `AWS_PROFILE=bibliothek` und keinen `DYNAMODB_ENDPOINT`

## Wichtig

Das AWS-Konsolenpasswort aus IAM Identity Center ist nur fuer den Browser-Login gedacht. Die App braucht ein AWS-CLI-Profil oder Access Keys.

## Variante A: AWS CLI mit SSO

```bash
aws configure sso --profile bibliothek
aws sso login --profile bibliothek
aws sts get-caller-identity --profile bibliothek
```

Danach `.env` so setzen:

```env
PORT=3000
AWS_REGION=eu-central-1
AWS_PROFILE=bibliothek
AUTH_SECRET=meine-lokale-secret-session
```

## Variante B: Access Key Profil

```bash
aws configure --profile bibliothek
aws sts get-caller-identity --profile bibliothek
```

Region:

```text
eu-central-1
```

Danach dieselbe `.env` verwenden:

```env
PORT=3000
AWS_REGION=eu-central-1
AWS_PROFILE=bibliothek
AUTH_SECRET=meine-lokale-secret-session
```

## Tabellen in AWS erstellen

Einmalig alles vorbereiten:

```bash
npm run setup-aws-db
```

Oder Schritt fuer Schritt:

```bash
npm run use-aws-db
npm run create-tables
npm run seed
```

Nur Tabellen erstellen:

```bash
npm run create-tables
```

Erstellt:

```text
Books
Members
Loans
Reviews
Categories
Payments
Users
```

## Testdaten in AWS einspielen

```bash
npm run seed
```

## App starten

```bash
npm run dev
```

Browser:

```text
http://localhost:5173
```

## Zurueck auf lokale Docker-Datenbank

Automatisch:

```bash
npm run use-local-db
```

Manuell `.env` wieder auf lokal setzen:

```env
PORT=3000
AWS_REGION=eu-central-1
DYNAMODB_ENDPOINT=http://localhost:8000
AWS_ACCESS_KEY_ID=dummy
AWS_SECRET_ACCESS_KEY=dummy
AUTH_SECRET=meine-lokale-secret-session
```
