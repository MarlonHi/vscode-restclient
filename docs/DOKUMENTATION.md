# REST Client – Dokumentation

Diese Dokumentation beschreibt alle Funktionen dieses Forks der REST Client Extension: das Schreiben und Senden von HTTP-Requests, Variablen und Umgebungen, Authentifizierung sowie die neu hinzugefügten Funktionen **Skripte**, **Tests**, **Polling** und **Request-Sequenzen**.

## Inhaltsverzeichnis

1. [Erste Schritte](#1-erste-schritte)
2. [Requests schreiben](#2-requests-schreiben)
3. [Requests senden und Antworten ansehen](#3-requests-senden-und-antworten-ansehen)
4. [Variablen](#4-variablen)
5. [Umgebungen](#5-umgebungen)
6. [Authentifizierung](#6-authentifizierung)
7. [Einstellungen pro Request](#7-einstellungen-pro-request)
8. [Skripte](#8-skripte)
9. [Tests und erwartete Statuscodes](#9-tests-und-erwartete-statuscodes)
10. [Polling für asynchrone APIs](#10-polling-für-asynchrone-apis)
11. [Sequenzen](#11-sequenzen)
12. [Der Sequenz-Report](#12-der-sequenz-report)
13. [Alle Einstellungen](#13-alle-einstellungen)
14. [Befehle und Tastenkürzel](#14-befehle-und-tastenkürzel)
15. [Die Extension bauen und installieren](#15-die-extension-bauen-und-installieren)

---

## 1. Erste Schritte

Lege eine Datei mit der Endung `.http` oder `.rest` an und schreibe einen Request hinein:

```http
GET https://example.com/comments/1
```

Über der Request-Zeile erscheint die CodeLens **Send Request**. Ein Klick darauf – oder <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>R</kbd> – sendet den Request, die Antwort öffnet sich in einem Vorschaufenster daneben.

Mehrere Requests in einer Datei werden mit einer Zeile aus mindestens drei Rauten `###` voneinander getrennt:

```http
GET https://example.com/comments/1

###

GET https://example.com/comments/2
```

Kommentare beginnen mit `#` oder `//`. Zeilen, die mit `# @` beginnen, sind keine normalen Kommentare, sondern **Metadaten**, die das Verhalten des Requests steuern (siehe [Abschnitt 7](#7-einstellungen-pro-request)).

---

## 2. Requests schreiben

### 2.1 Request-Zeile

Die erste nicht-leere Zeile eines Blocks ist die Request-Zeile. Die HTTP-Methode und die Version sind optional, ohne Methode wird `GET` angenommen. Die folgenden drei Requests sind identisch:

```http
GET https://example.com/comments/1 HTTP/1.1
```

```http
GET https://example.com/comments/1
```

```http
https://example.com/comments/1
```

### 2.2 Query-Parameter

Query-Parameter können direkt in der URL stehen oder – besser lesbar – auf mehrere Zeilen verteilt werden. Zeilen direkt nach der Request-Zeile, die mit `?` oder `&` beginnen, gehören zur URL:

```http
GET https://example.com/comments
    ?page=2
    &pageSize=10
```

### 2.3 Header

Alle Zeilen nach der Request-Zeile bis zur ersten Leerzeile sind Header im Format `Name: Wert`:

```http
GET https://example.com/comments HTTP/1.1
User-Agent: rest-client
Accept-Language: de-DE
Content-Type: application/json
```

Fehlt der `User-Agent`, wird automatisch `vscode-restclient` gesetzt. Standard-Header für alle Requests legst du über `rest-client.defaultHeaders` fest.

### 2.4 Body

Nach einer **Leerzeile** hinter den Headern beginnt der Body:

```http
POST https://example.com/comments HTTP/1.1
Content-Type: application/json

{
    "content": "Mein Kommentar"
}
```

**Body aus einer Datei** – der Pfad kann absolut oder relativ (zum Workspace oder zur `.http`-Datei) sein:

```http
POST https://example.com/comments HTTP/1.1
Content-Type: application/xml

< ./demo.xml
```

Sollen in dieser Datei Variablen aufgelöst werden, nutze `<@`. Eine abweichende Kodierung hängst du direkt an das `@` an:

```http
POST https://example.com/comments HTTP/1.1
Content-Type: application/xml

<@ ./demo.xml
```

```http
POST https://example.com/comments HTTP/1.1
Content-Type: application/xml

<@latin1 ./demo.xml
```

**Datei-Uploads mit `multipart/form-data`:**

```http
POST https://api.example.com/user/upload
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="text"

Titel
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="image"; filename="1.png"
Content-Type: image/png

< ./1.png
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

**Formulare mit `application/x-www-form-urlencoded`** dürfen auf mehrere Zeilen verteilt werden, jede weitere Zeile beginnt mit `&`:

```http
POST https://api.example.com/login HTTP/1.1
Content-Type: application/x-www-form-urlencoded

name=foo
&password=bar
```

### 2.5 GraphQL

Ein Request wird mit dem Header `X-REQUEST-TYPE: GraphQL` zu einem GraphQL-Request. Die Query steht im Body, die Variablen folgen nach einer **Leerzeile** als JSON:

```http
POST https://api.github.com/graphql
Content-Type: application/json
Authorization: Bearer xxx
X-REQUEST-TYPE: GraphQL

query ($name: String!, $owner: String!) {
  repository(name: $name, owner: $owner) {
    name
    description
    stargazers(first: 5) {
      totalCount
    }
  }
}

{
    "name": "vscode-restclient",
    "owner": "Huachao"
}
```

### 2.6 cURL-Befehle

Ein cURL-Befehl kann direkt in der Datei stehen und wie ein normaler Request gesendet werden:

```http
curl -X POST https://example.com/comments -H "Content-Type: application/json" -d "{\"content\":\"foo\"}"
```

Unterstützt werden `-X/--request`, `-L/--location/--url`, `-H/--header`, `-I/--head`, `-b/--cookie`, `-u/--user` (nur Basic Auth) und `-d/--data` in allen Varianten.

Umgekehrt wandelt **Rest Client: Copy Request As cURL** (Rechtsklick im Editor) einen geschriebenen Request in einen cURL-Befehl in der Zwischenablage um.

---

## 3. Requests senden und Antworten ansehen

| Aktion | Wie |
|---|---|
| Request senden | CodeLens **Send Request**, <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>R</kbd> oder Rechtsklick → *Send Request* |
| Nur markierten Text senden | Text markieren, dann senden |
| Request abbrechen | <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>K</kbd> oder Klick auf das Spinner-Symbol in der Statusleiste |
| Letzten Request wiederholen | <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>L</kbd> |
| Verlauf der letzten 50 Requests | <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>H</kbd> |
| Code-Snippet erzeugen | <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd>, danach Sprache und Bibliothek wählen |

In der Antwortvorschau stehen oben rechts **Save Full Response**, **Save Response Body** und **Copy Response Body** zur Verfügung, unter *More Actions…* zusätzlich **Fold/Unfold Response** und bei HTML-Antworten eine **HTML Preview**.

Wie viel von der Antwort angezeigt wird, steuert `rest-client.previewOption`:

| Wert | Anzeige |
|---|---|
| `full` | Statuszeile, Header und Body (Standard) |
| `headers` | nur Statuszeile und Header |
| `body` | nur der Body |
| `exchange` | Request **und** Antwort |

In der Statusleiste siehst du nach jedem Request die Dauer und die Größe der Antwort.

---

## 4. Variablen

Es gibt **benutzerdefinierte Variablen** (`{{name}}`) und **Systemvariablen** (`{{$name}}`). Bei gleichem Namen gilt diese Reihenfolge: Request-Variablen vor Datei-Variablen vor Skript-Variablen vor Umgebungsvariablen. Was in der `.http`-Datei selbst steht, gewinnt also immer gegen einen Wert, den irgendwann ein Skript gesetzt hat.

### 4.1 Umgebungsvariablen

Sie werden in den VS-Code-Einstellungen definiert und gelten dateiübergreifend. `$shared` enthält Werte für alle Umgebungen:

```json
"rest-client.environmentVariables": {
    "$shared": {
        "version": "v1"
    },
    "local": {
        "version": "v2",
        "host": "localhost:8080"
    },
    "production": {
        "host": "api.example.com"
    }
}
```

```http
GET https://{{host}}/api/{{version}}/comments/1 HTTP/1.1
```

### 4.2 Datei-Variablen

Definition mit `@name = wert` in einer eigenen Zeile, gültig in der gesamten Datei. Mit `{{%name}}` wird der Wert URL-kodiert eingesetzt.

```http
@hostname = api.example.com
@port = 8080
@host = {{hostname}}:{{port}}
@contentType = application/json
@createdAt = {{$datetime iso8601}}

###

@name = Strunk & White

GET https://{{host}}/authors/{{%name}} HTTP/1.1
```

### 4.3 Prompt-Variablen

Fragen den Wert beim Senden interaktiv ab. Heißt die Variable `password`, `passwd` oder `pass`, wird die Eingabe verdeckt.

```http
###
# @prompt username
# @prompt otp Einmalpasswort aus der E-Mail
POST https://{{host}}/verify-otp HTTP/1.1
Content-Type: application/json

{
    "username": "{{username}}",
    "otp": "{{otp}}"
}
```

### 4.4 Request-Variablen (Requests verketten)

Ein Request bekommt mit `# @name` einen Namen, danach können andere Requests auf seine Anfrage oder Antwort zugreifen:

```
{{requestName.(response|request).(body|headers).(*|JSONPath|XPath|Header-Name)}}
```

```http
@baseUrl = https://example.com/api

# @name login
POST {{baseUrl}}/login HTTP/1.1
Content-Type: application/x-www-form-urlencoded

name=foo&password=bar

###

@authToken = {{login.response.headers.X-AuthToken}}

# @name createComment
POST {{baseUrl}}/comments HTTP/1.1
Authorization: {{authToken}}
Content-Type: application/json

{
    "content": "Mein Kommentar"
}

###

GET {{baseUrl}}/comments/{{createComment.response.body.$.id}} HTTP/1.1
Authorization: {{authToken}}
```

> Wichtig: Ein benannter Request muss **einmal gesendet** worden sein, bevor seine Antwort verwendet werden kann. Sonst wird der Platzhalter als Text verschickt. Genau dafür sind [Sequenzen](#11-sequenzen) gedacht – sie senden die Requests in der richtigen Reihenfolge automatisch.

### 4.5 Systemvariablen

| Variable | Bedeutung |
|---|---|
| `{{$guid}}` | Zufällige UUID (RFC 4122 v4) |
| `{{$randomInt min max}}` | Zufallszahl zwischen `min` (inkl.) und `max` (exkl.) |
| `{{$timestamp [offset einheit]}}` | Aktueller UTC-Timestamp, z. B. `{{$timestamp -3 h}}` |
| `{{$datetime rfc1123\|iso8601\|"format" [offset einheit]}}` | Datum/Zeit, z. B. `{{$datetime "DD.MM.YYYY" 1 y}}` |
| `{{$localDatetime …}}` | Wie `$datetime`, aber in lokaler Zeitzone |
| `{{$processEnv [%]NAME}}` | Wert einer Umgebungsvariablen des Rechners |
| `{{$dotenv [%]NAME}}` | Wert aus der `.env`-Datei neben der `.http`-Datei |
| `{{$aadToken …}}` | Azure-AD-Token |
| `{{$aadV2Token …}}` | Token der Microsoft Identity Platform |
| `{{$oidcAccessToken …}}` | Token eines beliebigen OIDC-Providers |

Mögliche Einheiten für Offsets: `y`, `M`, `w`, `d`, `h`, `m`, `s`, `ms`.

```http
POST https://api.example.com/comments HTTP/1.1
Content-Type: application/json
Date: {{$datetime rfc1123}}

{
    "request_id": "{{$guid}}",
    "user": "{{$dotenv USERNAME}}",
    "created_at": "{{$timestamp -1 d}}",
    "review_count": "{{$randomInt 5 200}}"
}
```

### 4.6 Skript-Variablen

Zusätzlich kann jedes Skript mit `client.global.set('name', wert)` eine Variable setzen, die anschließend in allen Dateien als `{{name}}` zur Verfügung steht – siehe [Abschnitt 8](#8-skripte).

Diese Werte leben bis zum Schließen des Fensters und gelten **dateiübergreifend**. Eine Datei-Variable oder eine Request-Variable mit demselben Namen hat aber Vorrang, eine Umgebungsvariable nicht. Wenn ein Request unerwartet mit einem alten Token läuft, lohnt sich daher der Befehl **Rest Client: Clear Script Variables** – er meldet auch, wie viele Werte gesetzt waren.

---

## 5. Umgebungen

Die aktive Umgebung steht rechts unten in der Statusleiste. Gewechselt wird mit <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>E</kbd> oder über **Rest Client: Switch Environment**. Mit `No Environment` sind nur noch die Variablen aus `$shared` aktiv.

So lassen sich dieselben Requests gegen lokale, Test- und Produktivsysteme fahren, ohne die `.http`-Datei zu ändern.

---

## 6. Authentifizierung

### Basic Auth

Drei gleichwertige Schreibweisen:

```http
GET https://httpbin.org/basic-auth/user/passwd HTTP/1.1
Authorization: Basic user:passwd
```

```http
Authorization: Basic dXNlcjpwYXNzd2Q=
```

```http
Authorization: Basic user passwd
```

### Digest Auth

```http
GET https://httpbin.org/digest-auth/auth/user/passwd
Authorization: Digest user passwd
```

### SSL-Client-Zertifikate

Pro Host in den Einstellungen hinterlegen:

```json
"rest-client.certificates": {
    "localhost:8081": {
        "cert": "/pfad/client.crt",
        "key": "/pfad/client.key"
    },
    "example.com": {
        "pfx": "/pfad/clientcert.p12",
        "passphrase": "123456"
    }
}
```

### AWS Signature v4

```http
GET https://httpbin.org/aws-auth HTTP/1.1
Authorization: AWS <accessId> <accessKey> [token:<sessionToken>] [region:<region>] [service:<service>]
```

### AWS Cognito

```http
GET https://httpbin.org/aws-auth HTTP/1.1
Authorization: COGNITO <Username> <Password> <Region> <UserPoolId> <ClientId>
```

### Azure AD / OIDC

Über die Systemvariablen `{{$aadToken}}`, `{{$aadV2Token}}` und `{{$oidcAccessToken}}`:

```http
GET https://management.azure.com/subscriptions?api-version=2020-01-01
Authorization: {{$aadToken}}
```

Für eigene Login-Endpunkte ist ein [Skript](#8-skripte) meist der bessere Weg.

---

## 7. Einstellungen pro Request

Metadaten stehen als Kommentarzeile direkt über der Request-Zeile. `#` und `//` sind gleichwertig.

| Metadatum | Beispiel | Wirkung |
|---|---|---|
| `@name` | `# @name login` | Benennt den Request, Voraussetzung für Request-Variablen und Sequenzen |
| `@note` | `# @note` | Fragt vor dem Senden sicherheitshalber nach |
| `@no-redirect` | `# @no-redirect` | Folgt 3xx-Antworten nicht |
| `@no-cookie-jar` | `# @no-cookie-jar` | Speichert keine Cookies |
| `@prompt` | `# @prompt token` | Fragt eine Variable interaktiv ab |
| `@delay` | `# @delay 500` | Wartet 500 ms vor dem Senden |
| `@skip` | `# @skip` | Überspringt den Request in Sequenzen und bei *Run All* |
| `@expect` | `# @expect 201` | Erwarteter Statuscode |
| `@poll` | `# @poll` | Wiederholt den Request bis zur Bedingung |
| `@poll-interval` | `# @poll-interval 2000` | Wartezeit zwischen zwei Versuchen |
| `@poll-timeout` | `# @poll-timeout 120000` | Maximale Gesamtdauer des Pollings |
| `@poll-attempts` | `# @poll-attempts 30` | Maximale Anzahl Versuche |
| `@prescript` | `# @prescript ./login.js` | Skript vor dem Senden |
| `@postscript` | `# @postscript ./assert.js` | Skript nach der Antwort |

Dateiweit (eine Zeile pro Datei, üblicherweise ganz oben):

| Metadatum | Beispiel | Wirkung |
|---|---|---|
| `@use-scripts` | `# @use-scripts ./scripts/login.js` | Skript für **alle** Requests der Datei |

---

## 8. Skripte

Jeder Request kann JavaScript ausführen, bevor er gesendet wird (*Pre-Request*) und nachdem die Antwort da ist (*Post-Response*). Typische Anwendungsfälle: vorher einloggen, hinterher die Antwort prüfen.

### 8.1 Schreibweise

**Inline** im Request-Block – `< {% … %}` vor dem Request, `> {% … %}` danach:

```http
# @name createComment
< {%
    const auth = await sendRequest({
        method: 'POST',
        url: '{{host}}/api/login',
        headers: { 'Content-Type': 'application/json' },
        body: { user: 'admin', password: 'secret' }
    });
    client.global.set('token', auth.body.access_token);
%}
POST {{host}}/comments HTTP/1.1
Authorization: Bearer {{token}}
Content-Type: application/json

{ "content": "Mein Kommentar" }

> {%
    client.test('Status ist 201', () => client.assert(response.status === 201));
    client.test('Hat eine ID', () => client.assert(response.body.id !== undefined));
    client.global.set('commentId', response.body.id);
%}
```

**Als Datei**, wenn das Skript mehrfach gebraucht wird (Pfad relativ zur `.http`-Datei):

```http
# @prescript ./scripts/login.js
# @postscript ./scripts/assert-ok.js
GET {{host}}/comments HTTP/1.1
```

### 8.2 Verfügbare API

`await` darf direkt auf oberster Ebene verwendet werden.

| Baustein | Verfügbar in | Bedeutung |
|---|---|---|
| `sendRequest(url \| options)` | beiden | Sendet einen zusätzlichen HTTP-Request, z. B. den Login |
| `client.global.set/get/has/clear/clearAll` | beiden | Variablen, die danach überall als `{{name}}` nutzbar sind |
| `client.log(...)` / `console.log(...)` | beiden | Ausgabe im Output-Kanal *REST Client Scripts* |
| `client.assert(bedingung, meldung)` | beiden | Wirft einen Fehler, wenn die Bedingung falsch ist |
| `client.test(name, fn)` | Post-Response | Registriert einen Test, der im Report auftaucht |
| `request.variables.set/get/has` | Pre-Request | Variable nur für diesen einen Request |
| `request.headers.set/remove` | Pre-Request | Header dieses Requests setzen oder entfernen |
| `response` | Post-Response | `status`, `statusText`, `headers`, `contentType`, `body`, `rawBody`, `header(name)` |
| `request` | Post-Response | `method`, `url`, `headers`, `body` des gesendeten Requests |

Zusätzlich stehen `console`, `Buffer`, `crypto`, `URL`, `URLSearchParams`, `TextEncoder`, `TextDecoder` sowie `setTimeout`/`setInterval` zur Verfügung.

`response.body` ist bei JSON-Antworten bereits geparst, `response.rawBody` enthält den Text. In `sendRequest` werden `{{variablen}}` in URL, Headern und Body aufgelöst; ist `body` ein Objekt, wird es automatisch als JSON gesendet.

### 8.3 Dateiweite Skripte

Damit ein Login nicht in jedem Request wiederholt werden muss, deklariert man ihn einmal pro Datei:

```http
# @use-scripts ./scripts/login.js
@host = https://api.example.com

###
GET {{host}}/comments HTTP/1.1

###
GET {{host}}/comments/1 HTTP/1.1
```

Dateien **ohne** diese Zeile bleiben unberührt – Dateien mit anderer Authentifizierung funktionieren also unverändert weiter und können auf ihr eigenes Skript zeigen:

```http
# @use-scripts ./scripts/api-key.js
```

Alternativ lassen sich die Skripte pro Workspace in `.vscode/settings.json` konfigurieren und mit einem leeren `# @use-scripts` einbinden:

```json
{
    "rest-client.globalPreRequestScript": "scripts/login.js",
    "rest-client.globalPostResponseScript": "scripts/check-no-server-error.js"
}
```

```http
# @use-scripts
```

Diese Pfade sind relativ zum Workspace-Ordner, `${workspaceFolder}` wird ersetzt. Dateiweite Skripte laufen **vor** dem Skript des einzelnen Requests, ein einzelner Request kann also immer noch überschreiben.

Da das Skript bei jedem Request läuft, sollte das Token zwischengespeichert werden:

```js
// scripts/login.js
const expiresAt = +(client.global.get('tokenExpiresAt') ?? 0);
const tokenKey = `${await client.resolve('{{loginUrl}}')}|${await client.resolve('{{clientId}}')}`;

if (!client.global.get('token') || client.global.get('tokenKey') !== tokenKey || Date.now() > expiresAt - 30_000) {
    const auth = await sendRequest({
        method: 'POST',
        url: '{{loginUrl}}',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials&client_id={{clientId}}&client_secret={{clientSecret}}&scope=openid'
    });

    if (auth.status !== 200) {
        throw new Error(`login failed with ${auth.status}: ${auth.rawBody}`);
    }

    client.global.set('token', auth.body.access_token);
    client.global.set('tokenExpiresAt', Date.now() + auth.body.expires_in * 1000);
    client.global.set('tokenKey', tokenKey);
}

request.headers.set('Authorization', `Bearer ${client.global.get('token')}`);
```

Die Requests selbst brauchen dann keinen `Authorization`-Header mehr.

### 8.4 Fehler, Laufzeit und Ausgabe

* Ein `throw` im Pre-Request-Skript bricht den Request mit der geworfenen Meldung ab.
* Logs und Testergebnisse landen im Output-Kanal **REST Client Scripts**. Bei einem einzelnen Request öffnet sich dieser Kanal **nicht** automatisch.
* `rest-client.scriptTimeoutInMilliseconds` begrenzt die Laufzeit eines Skripts (Standard 30 s, `0` = unbegrenzt).
* `rest-client.enableScripts: false` schaltet die Skriptausführung komplett ab.

---

## 9. Tests und erwartete Statuscodes

Mit `# @expect` wird der erwartete Statuscode direkt am Request hinterlegt – ganz ohne Skript. Damit lassen sich auch Negativtests abbilden:

```http
###
# @name createComment
# @expect 201
POST {{host}}/comments HTTP/1.1
Content-Type: application/json

{ "content": "Mein Kommentar" }

###
# @name createCommentOhneToken
# @expect 401, 403
POST {{host}}/comments HTTP/1.1

###
# @name unbekannterKommentar
# @expect 4xx
GET {{host}}/comments/gibt-es-nicht HTTP/1.1
```

Erlaubt sind:

| Schreibweise | Trifft auf zu |
|---|---|
| `201` | genau 201 |
| `2xx` | 200–299 |
| `x0x` | Jede Stelle mit `x` ist beliebig, also 100–109, 200–209, 300–309 … |
| `400-404` | Bereich von 400 bis 404 |
| `401, 403` | Aufzählung, eine Übereinstimmung genügt |

Alternative Namen: `# @expect-status` und `# @expected-status`.

Stimmt der Status nicht, gilt der Request als fehlgeschlagen: Das Ergebnis wird als `FAIL` in den Output-Kanal geschrieben und bricht eine laufende [Sequenz](#11-sequenzen) ab. Ein **einzeln** gesendeter Request wird dabei nicht von einem Popup unterbrochen – seine Antwort siehst du ohnehin in der Vorschau.

Für Prüfungen, die über den Status hinausgehen, ist `client.test` im Post-Response-Skript zuständig:

```http
# @expect 200
GET {{host}}/comments/1 HTTP/1.1

> {%
    client.test('Antwort ist JSON', () => client.assert(response.contentType?.includes('json')));
    client.test('Richtiger Autor', () => client.assert(response.body.author === 'admin', `war ${response.body.author}`));
    client.test('Schnell genug', () => client.assert(response.timings.total < 500));
%}
```

---

## 10. Polling für asynchrone APIs

APIs, die eine Aufgabe nur anstoßen und erst später fertig sind, lassen sich mit `# @poll` so lange abfragen, bis eine Bedingung erfüllt ist.

```http
###
# @name startImport
# @expect 202
POST {{host}}/imports HTTP/1.1

###
# @name warteAufImport
# @poll response.body.state === 'COMPLETED' || response.body.state === 'FAILED'
# @poll-interval 2000
# @poll-timeout 120000
# @expect 200
GET {{host}}/imports/{{startImport.response.body.$.id}} HTTP/1.1

> {%
    client.test('Import erfolgreich', () => client.assert(response.body.state === 'COMPLETED', response.body.error));
%}
```

| Metadatum | Bedeutung |
|---|---|
| `# @poll [ausdruck]` | Schaltet das Polling ein. Mit JavaScript-Ausdruck wird gepollt, bis dieser wahr ist. Alias: `# @poll-until` |
| `# @poll-interval <ms>` | Pause zwischen zwei Versuchen (Standard `rest-client.pollIntervalInMilliseconds`, 1000 ms) |
| `# @poll-timeout <ms>` | Abbruch nach dieser Gesamtdauer (Standard `rest-client.pollTimeoutInMilliseconds`, 60000 ms) |
| `# @poll-attempts <n>` | Abbruch nach dieser Anzahl Versuche |

**Ohne Ausdruck** wird der mit `# @expect` erwartete Status als Bedingung verwendet, andernfalls „irgendein 2xx“. Für reines Warten auf einen Status genügt also:

```http
###
# @name warteAufImport
# @poll
# @expect 200
# @poll-interval 2000
GET {{host}}/imports/42 HTTP/1.1
```

Weitere Details:

* Das Polling startet, sobald **eines** der vier Metadaten gesetzt ist.
* Im Ausdruck stehen `response.status`, `response.body`, `response.headers` und `client.global` zur Verfügung.
* Wirft der Ausdruck einen Fehler, weil ein Feld noch nicht existiert, zählt der Versuch einfach als „noch nicht fertig“ und es wird weiter gepollt.
* Nur die **letzte** Antwort landet in der Vorschau, wird als Request-Variable gespeichert und an das Post-Response-Skript übergeben. Jeder Versuch wird im Output-Kanal protokolliert.
* Läuft die Zeit oder die Versuchszahl ab, gilt der Request als fehlgeschlagen und stoppt eine laufende Sequenz.
* <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>K</kbd> bricht auch ein laufendes Polling ab.

---

## 11. Sequenzen

Eine Sequenz führt benannte Requests nacheinander aus. Definiert wird sie in einem eigenen Block, der nur aus Kommentarzeilen besteht:

```http
###
# @sequence Kommentar-Ablauf
# @steps login, createComment, getCreatedComment, deleteComment
# @delay 200

###
# @name login
POST {{host}}/api/login HTTP/1.1
Content-Type: application/json

{ "user": "admin", "password": "secret" }

###
# @name createComment
# @expect 201
POST {{host}}/comments HTTP/1.1
Authorization: Bearer {{login.response.body.$.access_token}}
Content-Type: application/json

{ "content": "Mein Kommentar" }

###
# @name getCreatedComment
# @expect 200
GET {{host}}/comments/{{createComment.response.body.$.id}} HTTP/1.1

###
# @name deleteComment
# @expect 204
DELETE {{host}}/comments/{{createComment.response.body.$.id}} HTTP/1.1
```

Über der `# @sequence`-Zeile erscheint die CodeLens **Run Sequence**. Alternativ <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd> oder **Rest Client: Run Request Sequence**.

| Metadatum | Bedeutung |
|---|---|
| `# @sequence <name>` | Beginnt eine Sequenz und zeigt die CodeLens an |
| `# @steps <namen>` | Kommagetrennte Namen der Requests; darf über mehrere Zeilen verteilt werden, `# @step` geht auch |
| `# @delay <ms>` | Pause zwischen zwei Schritten |
| `# @continue-on-error` | Läuft weiter, auch wenn ein Schritt oder Test fehlschlägt |
| `# @prescript <datei>` oder `< {% … %}` | Setup-Skript, läuft **einmal** vor dem ersten Schritt |

### 11.1 Ablauf

* Jeder Schritt durchläuft die komplette Verarbeitung eines normalen Requests – inklusive seiner eigenen Skripte, `@expect`, `@poll` und `@delay`.
* Die Antwort jedes Schritts wird als Request-Variable gespeichert, spätere Schritte können also `{{login.response.body.$.token}}` verwenden.
* Standardmäßig stoppt die Sequenz beim ersten fehlgeschlagenen Request oder Test (`rest-client.stopSequenceOnError`).
* Der Fortschritt wird als Benachrichtigung angezeigt und kann dort abgebrochen werden.
* Welche Antworten in der Vorschau landen, steuert `rest-client.previewSequenceResponses` (`none`, `last`, `all`).

### 11.2 Setup-Skript

Alles, was für alle Schritte gilt, gehört in das Setup-Skript – es läuft genau einmal pro Durchlauf:

```http
###
# @sequence Kommentar-Ablauf
# @steps createComment, getCreatedComment, deleteComment
< {%
    const auth = await sendRequest({
        method: 'POST',
        url: '{{host}}/api/login',
        headers: { 'Content-Type': 'application/json' },
        body: { user: 'admin', password: 'secret' }
    });
    request.variables.set('token', auth.body.access_token);
    request.headers.set('X-Correlation-Id', crypto.randomUUID());
%}
```

Was dort mit `request.variables.set` und `request.headers.set` gesetzt wird, gilt für **jeden** Schritt dieses Durchlaufs. Schlägt das Setup fehl, startet die Sequenz nicht.

### 11.3 Einzelne Requests überspringen

```http
###
# @name deleteComment
# @skip
DELETE {{host}}/comments/1 HTTP/1.1
```

Der Request lässt sich weiterhin ganz normal einzeln senden, nur *Run Sequence* und *Run All Requests In File* gehen daran vorbei und führen ihn im Report als übersprungen auf.

### 11.4 Alle Requests einer Datei ausführen

**Rest Client: Run All Requests In File** sendet alle Requests der Datei von oben nach unten – ohne dass eine Sequenz definiert sein muss. `# @skip` wird dabei ebenso beachtet.

---

## 12. Der Sequenz-Report

Nach jedem Sequenzlauf (und nach *Run All*) öffnet sich daneben ein Bericht mit:

* dem Gesamturteil **PASSED**, **FAILED** oder **CANCELLED**,
* der Anzahl erfolgreicher, fehlgeschlagener und übersprungener Requests,
* der Gesamtzahl bestandener Tests und der Gesamtdauer,
* einer Tabelle pro Schritt mit Methode, URL, Statuscode, Dauer, Testergebnis und Fehlermeldung,
* einer Auflistung aller einzelnen Tests mit ihren Meldungen.

Steuerung über `rest-client.showSequenceReport`:

| Wert | Verhalten |
|---|---|
| `always` | Immer anzeigen (Standard) |
| `onFailure` | Nur wenn etwas fehlgeschlagen ist |
| `never` | Nie; die Zusammenfassung steht weiterhin im Output-Kanal |

Der Report gehört ausschließlich zu Sequenzen. Ein einzeln gesendeter Request öffnet ihn nie – auch dann nicht, wenn sein `# @expect` fehlschlägt.

---

## 13. Alle Einstellungen

### Requests und Antworten

| Einstellung | Standard | Bedeutung |
|---|---|---|
| `rest-client.followredirect` | `true` | 3xx-Antworten als Weiterleitung verfolgen |
| `rest-client.defaultHeaders` | `{"User-Agent": "vscode-restclient"}` | Header, die jedem Request fehlen |
| `rest-client.timeoutinmilliseconds` | `0` | Timeout, `0` = unbegrenzt |
| `rest-client.rememberCookiesForSubsequentRequests` | `true` | Cookies für Folge-Requests speichern |
| `rest-client.certificates` | `{}` | Client-Zertifikate pro Host |
| `rest-client.excludeHostsForProxy` | `[]` | Hosts ohne Proxy |
| `rest-client.formParamEncodingStrategy` | `automatic` | Kodierung von `x-www-form-urlencoded` |
| `rest-client.decodeEscapedUnicodeCharacters` | `false` | Unicode-Escapes in der Antwort auflösen |

### Vorschau

| Einstellung | Standard | Bedeutung |
|---|---|---|
| `rest-client.previewOption` | `full` | Angezeigter Teil der Antwort |
| `rest-client.previewColumn` | `beside` | Spalte der Vorschau |
| `rest-client.previewResponseInUntitledDocument` | `false` | Antwort als Textdokument statt Webview |
| `rest-client.previewResponsePanelTakeFocus` | `true` | Vorschau erhält den Fokus |
| `rest-client.showResponseInDifferentTab` | `false` | Jede Antwort in einem eigenen Tab |
| `rest-client.requestNameAsResponseTabTitle` | `false` | Request-Name als Tab-Titel |
| `rest-client.fontSize` / `fontFamily` / `fontWeight` | – | Schrift in der Vorschau |
| `rest-client.largeResponseBodySizeLimitInMB` | `5` | Ab wann eine Antwort als „groß“ gilt |

### Umgebung und Oberfläche

| Einstellung | Standard | Bedeutung |
|---|---|---|
| `rest-client.environmentVariables` | `{}` | Umgebungen und ihre Variablen |
| `rest-client.mimeAndFileExtensionMapping` | `{}` | Dateiendung je MIME-Type beim Speichern |
| `rest-client.enableSendRequestCodeLens` | `true` | CodeLens *Send Request* |
| `rest-client.enableCustomVariableReferencesCodeLens` | `true` | CodeLens für Variablenreferenzen |
| `rest-client.logLevel` | `error` | Ausführlichkeit der Logausgabe |
| `rest-client.enableTelemetry` | `false` | Anonyme Nutzungsdaten |

### Skripte, Tests, Polling und Sequenzen

| Einstellung | Standard | Bedeutung |
|---|---|---|
| `rest-client.enableScripts` | `true` | Skriptausführung aktivieren |
| `rest-client.scriptTimeoutInMilliseconds` | `30000` | Timeout je Skript, `0` = unbegrenzt |
| `rest-client.globalPreRequestScript` | `""` | Skript für Dateien mit `# @use-scripts` |
| `rest-client.globalPostResponseScript` | `""` | Antwort-Skript für Dateien mit `# @use-scripts` |
| `rest-client.pollIntervalInMilliseconds` | `1000` | Standardpause beim Polling |
| `rest-client.pollTimeoutInMilliseconds` | `60000` | Standard-Timeout beim Polling |
| `rest-client.enableSequenceCodeLens` | `true` | CodeLens *Run Sequence* |
| `rest-client.stopSequenceOnError` | `true` | Sequenz beim ersten Fehler abbrechen |
| `rest-client.previewSequenceResponses` | `last` | `none`, `last` oder `all` |
| `rest-client.showSequenceReport` | `always` | `always`, `onFailure` oder `never` |

---

## 14. Befehle und Tastenkürzel

| Befehl | Kürzel |
|---|---|
| Rest Client: Send Request | <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>R</kbd> |
| Rest Client: Rerun Last Request | <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>L</kbd> |
| Rest Client: Cancel Request | <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>K</kbd> |
| Rest Client: Run Request Sequence | <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>S</kbd> |
| Rest Client: Run All Requests In File | – |
| Rest Client: Switch Environment | <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>E</kbd> |
| Rest Client: Request History | <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>H</kbd> |
| Rest Client: Generate Code Snippet | <kbd>Strg</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> |
| Rest Client: Copy Request As cURL | – |
| Rest Client: Clear Script Variables | – |
| Rest Client: Clear Request History | – |
| Rest Client: Clear Cookies | – |
| Rest Client: Clear Azure AD Token Cache | – |
| Rest Client: Import from file (Swagger) | – |

Unter macOS steht <kbd>Cmd</kbd> statt <kbd>Strg</kbd>.

Zum Navigieren innerhalb großer `.http`-Dateien führt <kbd>Strg</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> zu allen benannten Requests und Datei-Variablen.

---

## 15. Die Extension bauen und installieren

```bash
npm install                                        # einmalig
npx webpack --mode production                      # Bundle bauen
npx @vscode/vsce package --allow-star-activation   # .vsix erzeugen
code --install-extension rest-client-fork-<version>.vsix
```

Anschließend das Fenster neu laden. Die Version in der `package.json` muss vor jedem erneuten Installieren erhöht werden, sonst übernimmt VS Code das Paket nicht.

Zum Entwickeln genügt <kbd>F5</kbd>: Damit startet ein zweites VS-Code-Fenster mit der Extension, parallel hält `npm run watch` den Build aktuell.

---

## Vollständiges Beispiel

```http
# @use-scripts ./scripts/login.js
@host = https://api.example.com

###
# @sequence Smoke-Test
# @steps anlegen, abrufen, verarbeiten, loeschen
# @delay 100

###
# @name anlegen
# @expect 201
POST {{host}}/documents HTTP/1.1
Content-Type: application/json

{ "title": "Testdokument" }

> {%
    client.test('Hat eine ID', () => client.assert(response.body.id !== undefined));
%}

###
# @name abrufen
# @expect 200
GET {{host}}/documents/{{anlegen.response.body.$.id}} HTTP/1.1

> {%
    client.test('Titel stimmt', () => client.assert(response.body.title === 'Testdokument'));
%}

###
# @name verarbeiten
# @poll response.body.state === 'DONE' || response.body.state === 'ERROR'
# @poll-interval 2000
# @poll-timeout 60000
# @expect 200
GET {{host}}/documents/{{anlegen.response.body.$.id}}/processing HTTP/1.1

> {%
    client.test('Verarbeitung erfolgreich', () => client.assert(response.body.state === 'DONE', response.body.error));
%}

###
# @name loeschen
# @expect 204
DELETE {{host}}/documents/{{anlegen.response.body.$.id}} HTTP/1.1

###
# @name loeschenOhneBerechtigung
# @expect 401, 403
DELETE {{host}}/documents/1 HTTP/1.1
Authorization: Bearer ungueltiges-token
```
