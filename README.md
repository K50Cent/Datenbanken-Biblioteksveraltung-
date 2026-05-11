# Bibliotheksverwaltung

Ein sehr einfacher Startpunkt fuer die Bibliotheksverwaltung:

- DynamoDB-Verbindung in `backend/dynamodb.js`
- kleine Login-API in `backend/server.js`
- einfache Login-Seite in `public/index.html`
- einfache Bibliotheksseite in `public/library.html`

## Lokal starten

```bash
npm run use-local-db
npm run setup-users
npm run dev
```

DynamoDB Local muss unter `http://localhost:8000` laufen.

Die Seite ist danach hier erreichbar:

```text
http://localhost:3000
```

Nach der Anmeldung wird zur Bibliotheksseite weitergeleitet:

```text
http://localhost:3000/library.html
```

## AWS starten

```bash
npm run use-aws-db
aws sts get-caller-identity --profile bibliothek
npm run setup-users
npm run dev
```

## Test-Login

```text
Loginname: Admin
Passwort: Admin
```

Admin-Benutzer sehen den Admin-Bereich fuer Buecher anlegen, verwalten und loeschen.
Normale Benutzer sehen nur die Ausleihe.

## Datenbank-Konfiguration

Die Verbindung liest `.env`:

```env
PORT=3000
AWS_REGION=eu-central-1
USERS_TABLE=Users
AUTH_SECRET=meine-lokale-secret-session
```

Lokal kommen zusaetzlich dazu:

```env
DYNAMODB_ENDPOINT=http://localhost:8000
AWS_ACCESS_KEY_ID=dummy
AWS_SECRET_ACCESS_KEY=dummy
```

AWS nutzt stattdessen:

```env
AWS_PROFILE=bibliothek
```
