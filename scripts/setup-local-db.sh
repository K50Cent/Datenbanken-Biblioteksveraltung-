#!/usr/bin/env sh
set -eu

ENDPOINT="${DYNAMODB_ENDPOINT:-http://localhost:8000}"
CONTAINER_NAME="${DYNAMODB_CONTAINER_NAME:-dynamodb-local}"

echo "== Bibliotheksverwaltung: lokale Datenbank vorbereiten =="

is_dynamodb_reachable() {
  curl -sS -o /dev/null "$ENDPOINT" >/dev/null 2>&1
}

if ! command -v node >/dev/null 2>&1; then
  echo "Fehler: Node.js ist nicht installiert oder nicht im PATH."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Fehler: npm ist nicht installiert oder nicht im PATH."
  exit 1
fi

if ! is_dynamodb_reachable; then
  echo "DynamoDB Local antwortet noch nicht unter $ENDPOINT."

  if ! command -v docker >/dev/null 2>&1; then
    echo "Fehler: Docker ist nicht installiert oder nicht im PATH."
    echo "Bitte Docker Desktop starten und danach erneut ausfuehren."
    exit 1
  fi

  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    echo "Starte vorhandenen Container $CONTAINER_NAME ..."
    if ! docker start "$CONTAINER_NAME" >/dev/null; then
      echo "Container $CONTAINER_NAME konnte nicht gestartet werden."
      echo "Pruefe, ob Port 8000 bereits von einem anderen Dienst belegt ist."
    fi
  else
    echo "Erstelle und starte Container $CONTAINER_NAME ..."
    if ! docker run -d \
      --name "$CONTAINER_NAME" \
      -p 8000:8000 \
      amazon/dynamodb-local \
      -jar DynamoDBLocal.jar -sharedDb >/dev/null; then
      echo "Container $CONTAINER_NAME konnte nicht erstellt werden."
      echo "Pruefe, ob Port 8000 bereits von einem anderen Dienst belegt ist."
    fi
  fi

  echo "Warte auf DynamoDB Local ..."
  ATTEMPT=1
  while [ "$ATTEMPT" -le 30 ]; do
    if is_dynamodb_reachable; then
      break
    fi

    sleep 1
    ATTEMPT=$((ATTEMPT + 1))
  done
fi

if ! is_dynamodb_reachable; then
  echo "Fehler: DynamoDB Local ist unter $ENDPOINT nicht erreichbar."
  exit 1
fi

echo "Installiere npm-Abhaengigkeiten ..."
npm install

echo "Erstelle DynamoDB-Tabellen ..."
npm run create-tables

echo "Spiele Testdaten ein ..."
npm run seed

echo "Pruefe Demo-Abfragen ..."
npm run demo-queries

echo "Fertig. Die Datenbank ist vorbereitet."
echo "Web-App starten mit: npm run dev"
echo "Browser: http://localhost:3000"
