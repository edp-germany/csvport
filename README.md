# CSVport

Kleine Firebase-Webapp, die CSV-Dateien automatisiert per FTP abruft, in statische JSON-Dateien umwandelt und modern tabellarisch darstellt.

## Architektur

- `app/`: React + Vite Frontend mit Tabs, Suche und Filtern
- `functions/scripts/`: Node-Skript fuer FTP-Abruf und JSON-Erzeugung
- `app/public/data/`: generierte Datendateien fuer Firebase Hosting

## Warum diese Struktur?

FTP-Zugriffe koennen nicht sicher direkt im Browser stattfinden. Auf dem kostenlosen Spark-Tarif sind Google-Cloud-Funktionen wie Cloud Functions und Secret Manager nicht verfuegbar. Deshalb wird die CSV ausserhalb von Firebase abgerufen und als statische JSON-Datei nach `app/public/data/` geschrieben. Firebase Hosting liefert danach nur noch statische Dateien aus.

## Konfiguration

Lokal in `functions/.env.local`:

```bash
FTP_HOST=ftp.example.com
FTP_PORT=21
FTP_USER=my-user
FTP_PASSWORD=my-password
FTP_SECURE=false
CSV_TABLES=[{"id":"main","label":"Haupttabelle","path":"/export/main.csv","delimiter":",","refreshMinutes":30}]
```

Eine kopierbare Vorlage liegt auch in [functions/.env.example](/Users/kkruse/Documents/CSVport/functions/.env.example).

`CSV_TABLES` ist bewusst als Array aufgebaut, damit spaeter mehrere CSV-Dateien als Tabs erscheinen koennen.

## Lokale Entwicklung

```bash
npm install
npm run sync:data
npm run dev -w app
```

## Deployment auf Firebase

1. `npm install`
2. `npm run sync:data`
3. `npm run build`
4. `firebase deploy --only hosting`

Das Firebase-Projekt `csvport` ist bereits in [.firebaserc](/Users/kkruse/Documents/CSVport/.firebaserc) hinterlegt, und die Web-App-Konfiguration ist in [app/src/firebase.ts](/Users/kkruse/Documents/CSVport/app/src/firebase.ts) initialisiert.

## Datendateien

- `GET /data/tables.json`: Liefert die konfigurierten Tabellen
- `GET /data/<tabellen-id>.json`: Liefert Metadaten und Zeilen einer Tabelle

## Hinweise

- Mehrere CSV-Dateien werden ueber `CSV_TABLES` als Tabs vorbereitet.
- Auf dem kostenlosen Spark-Tarif kann Firebase selbst den FTP-Abruf nicht serverseitig automatisieren. Der vorgesehene Betriebsweg ist deshalb lokal: CSV synchronisieren, App bauen, dann auf Firebase Hosting deployen.

## Aktuelle Konfiguration

Fuer deine aktuelle Tabelle ist `CSV_TABLES`:

```json
[{"id":"eparts","label":"eparts","path":"edp-pricelist.csv","delimiter":";","refreshMinutes":30}]
```

## Render Backend

Wenn der Refresh-Button live per FTP aktualisieren soll, laeuft dafuer ein kleines Backend auf Render.

Render-Service:

- Service-Typ: `Web Service`
- Runtime: `Node`
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`

Environment Variables in Render:

- `FTP_HOST`
- `FTP_PORT`
- `FTP_USER`
- `FTP_PASSWORD`
- `FTP_SECURE`
- `CSV_TABLES`
- `FRONTEND_ORIGIN`

`FRONTEND_ORIGIN` sollte spaeter auf deine Firebase-URL zeigen, zum Beispiel `https://csvport.web.app`.

Sobald Render live ist, baust du das Frontend mit:

```bash
VITE_API_BASE_URL=https://dein-render-service.onrender.com npm run build
```

Danach:

```bash
firebase deploy --only hosting
```
