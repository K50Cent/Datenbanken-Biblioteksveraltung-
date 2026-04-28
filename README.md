# Bibliotheksverwaltung

Vue/Vite-Frontend mit Express-Backend und DynamoDB Local.

## Start in WebStorm

1. Docker Desktop starten.
2. DynamoDB Local muss unter `http://localhost:8000` laufen.
3. Im WebStorm-Terminal ausfuehren:

```bash
npm run setup-db
npm run dev
```

Dann im Browser oeffnen:

```text
http://localhost:5173
```

## Wichtige Scripts

```bash
npm run dev            # Frontend und Backend zusammen starten
npm run dev:frontend   # nur Vite-Frontend auf Port 5173
npm run dev:backend    # nur Express-Backend auf Port 3000
npm run create-tables  # DynamoDB-Tabellen erstellen
npm run seed           # Testdaten einspielen
npm run demo-queries   # Beispielabfragen ausfuehren
npm run use-aws-db     # .env auf AWS DynamoDB Cloud umstellen
npm run setup-aws-db   # AWS Tabellen erstellen und seed ausfuehren
npm run use-local-db   # .env auf DynamoDB Local umstellen
npm run build          # Frontend fuer Produktion bauen
npm start              # Express-Backend mit gebautem Frontend starten
```

## Anmeldung

Admin-Zugang:

```text
Benutzername: Admin
Passwort: Admin
```

Normale Benutzer koennen sich in der App registrieren. Sie duerfen danach nur
ihre eigenen Buecher bearbeiten und loeschen. Der Admin darf alle Buecher
bearbeiten und loeschen.

## Funktionen

- Buecher anzeigen und suchen
- Neues Buch ueber die eigene Ansicht `Buch anlegen` erstellen
- Buchbild beim Anlegen oder Bearbeiten hochladen
- Buecher ausleihen und zurueckgeben
- Nach der Rueckgabe ein Buch mit 1 bis 5 Sternen bewerten
- Normale Benutzer bearbeiten/loeschen nur eigene Buecher
- Admin bearbeitet/loescht alle Buecher
- Profil oben rechts oeffnen
- Anzeigename im Profil aendern
- Passwort im Profil aendern
- Geld im Profil einzahlen und Guthaben anzeigen

Seed-Testbenutzer:

```text
ramona / test123
kjell / test123
```

## Datenbank

Die Verbindung steht in `.env`:

```env
PORT=3000
AWS_REGION=eu-central-1
DYNAMODB_ENDPOINT=http://localhost:8000
AWS_ACCESS_KEY_ID=dummy
AWS_SECRET_ACCESS_KEY=dummy
```

Fuer AWS DynamoDB Cloud siehe:

```text
AWS_SETUP.md
```

Tabellen:

```text
Books
Members
Loans
Reviews
Categories
Payments
Users
```

## Projektstruktur

```text
backend/        Express API, DynamoDB-Verbindung, Setup- und Seed-Scripts
src/            Vue-Frontend
datagrip/       PartiQL-Beispiele fuer DataGrip
scripts/        lokales Setup-Script
```
