---
title: Gruppen-Steuerung für den Devices-Adapter
sidebar_label: Gruppen-Steuerung
description: Mehrere Geräte über eine gemeinsame Kachel in der Devices-Auto-GUI steuern — drei Varianten, pro Gruppe wählbar, Geräteklasse per Profil.
---

# Gruppen-Steuerung für den Devices-Adapter

Mehrere gleichartige Aliase (Jalousien, Schalter, Dimmer, …) lassen sich
über eine gemeinsame Kachel in der Auto-GUI des iobroker.devices-Adapters
steuern. Die Gruppen werden in `gruppen.json` definiert, die Geräteklassen
als Profile in `gruppen-vorlagen.json`; `gruppen-aufbau.js` baut daraus
die Objekte auf. Pro Gruppe ist eine von drei Varianten wählbar. Das
Skript selbst enthält keine Geräteklassen-Annahmen — gleiches Muster wie
beim Alias-Aufbau (`vorlagen.json`): Konfiguration in JSON, Logik im
Skript.

## gruppen-vorlagen.json

Ein Eintrag pro Profil (flache Tabelle, in jsontable.app editierbar).
Ablage im Dateispeicher unter
`0_userdata.0 : configuration.read.by.scripts/gruppen-vorlagen.json`:

```json
{
  "profil": "jalousie",
  "typ": "number",
  "rolle": "level.blind",
  "stateName": "LEVEL",
  "channelRole": "blind",
  "unit": "%",
  "min": 0,
  "max": 100,
  "def": null
}
```

| Feld | Bedeutung |
|---|---|
| `profil` | Schlüssel, unter dem Gruppen das Profil referenzieren (z.B. `"jalousie"`, `"schalter"`, `"dimmer"`) |
| `typ` | `common.type` der Gruppen-States: `"number"` oder `"boolean"` |
| `rolle` | Rolle des Gruppen-States — bei B die des Szenen-Objekts, bei C die des Alias-States (z.B. `"level.blind"`, `"switch"`, `"level.dimmer"`) |
| `stateName` | Name des States im Alias-Kanal bei Variante C (z.B. `"LEVEL"` bei Jalousie/Dimmer, `"SET"` bei Schalter) |
| `channelRole` | Rolle des Alias-Kanals bei Variante C (z.B. `"blind"`, `"socket"`, `"light"`) |
| `unit`, `min`, `max`, `def` | Optionale `common`-Felder; `null` = Feld wird weggelassen |

Mitgeliefert sind drei Profile: `jalousie` (number/`level.blind`/`LEVEL`,
identisch zum früheren fest verdrahteten Verhalten), `schalter`
(boolean/`switch`/`SET`) und `dimmer` (number/`level.dimmer`/`LEVEL`).

## gruppen.json

Pro Gruppe ein Eintrag (flache Tabelle, wie `vorlagen.json`/`mapping.json`
in jsontable.app editierbar). Ablage im Dateispeicher unter
`0_userdata.0 : configuration.read.by.scripts/gruppen.json`:

```json
{
  "gruppe": "Jalousien_alle",
  "name": "Alle Jalousien",
  "variante": "A",
  "profil": "jalousie",
  "raum": "Zentrale",
  "funktion": "Jalousie",
  "wertZu": 100,
  "wertAuf": 0,
  "formel": null,
  "mitglieder": [
    "alias.0.scripted aliases.JalousieArbeitszimmer.SET",
    "alias.0.scripted aliases.JalousieSchlafzimmer.SET"
  ]
}
```

| Feld | Bedeutung |
|---|---|
| `gruppe` | Technischer Name, wird Teil der Objekt-ID (keine Leer-/Sonderzeichen) |
| `name` | Anzeigename in der GUI |
| `variante` | `"A"`, `"B"` oder `"C"` (siehe unten) |
| `profil` | **Pflicht** — Referenz auf einen Eintrag in `gruppen-vorlagen.json`; unbekanntes Profil = Fehler-Log, Gruppe wird übersprungen |
| `raum`, `funktion` | Enum-Zuweisung — **Pflicht**, sonst erscheint die Gruppe nicht in der Devices-Auto-GUI |
| `wertZu`, `wertAuf` | Nur Variante A: feste Zielwerte der beiden Taster; bei B/C `null`. Passen die Werte nicht zum `typ` des Profils, warnt das Skript |
| `formel` | Nur Variante C, optional: JS-Ausdruck mit `val` (gleicher Stil wie `schreiben` in `vorlagen.json`, z.B. `"100 - val"`), wird beim Fan-out auf den Wert angewendet, bevor er an die Mitglieder geht. Leer/`null` = keine Transformation. Bei A/B wird eine gesetzte Formel mit Fehler-Log ignoriert |
| `mitglieder` | Liste der Alias-State-IDs — in diesem Setup der `SET`-Datenpunkt der skriptgebauten Aliase, also `alias.0.scripted aliases.<gerät>.SET` |

Fehlende Mitglieds-IDs werden mit Warnung übersprungen, nicht abgebrochen.
Für Variante A/B muss der `iobroker.scenes`-Adapter installiert sein
(das Skript prüft das und warnt nur, es installiert nichts).

## Die drei Varianten

Durchgespielte Beispiele — je Variante eine Jalousien-Gruppe (Auf/Zu +
Positions-Slider) und eine Licht-Gruppe (An/Aus + Helligkeits-Slider)
mit Ergebnis-Erklärung — stehen in
[gruppen-beispiele.md](gruppen-beispiele.md).

### Variante A — Szene als Taster

Zwei `scene.0.*`-Boolean-Objekte (`<gruppe>_zu`, `<gruppe>_auf`) mit
festen Zielwerten aus `wertZu`/`wertAuf`. Die Devices-GUI rendert je
eine Kachel mit Button.

**Richtig, wenn** „alles zu / alles auf" reicht: minimalste Objekte,
kein JS zur Laufzeit, kein Extra-State. **Grenze:** kein Slider, keine
Zwischenwerte.

### Variante B — virtuelle Gruppe

Ein `scene.0.<gruppe>`-Objekt mit `native.virtualGroup: true` und der
Rolle aus dem Profil (`rolle`, z.B. `level.blind`). Ein geschriebener
Wert wird vom Szenen-Adapter direkt auf alle Mitglieder kopiert —
stufenlos, ohne JS.

**Richtig als Mittelweg:** Slider ohne Zusatz-Objekte. **Grenze:** das
`uncertain`-Verhalten (siehe unten).

### Variante C — Alias mit JS-Fan-out

Drei Bausteine: ein Halter-State `0_userdata.0.Gruppen.<gruppe>_soll`,
ein Alias-Kanal `alias.0.Gruppen.<gruppe>` (Kanal-Rolle aus
`channelRole`) mit einem State namens `stateName` (Rolle, Typ und
Einheit aus dem Profil, read+write auf den Halter) und ein JS-Trigger,
der jeden geschriebenen Sollwert auf alle Mitglieder verteilt — bei
gesetzter `formel` transformiert. Der Trigger reagiert nur auf
Schreib-Kommandos (`ack=false`) und bestätigt den Halter danach selbst
mit `ack=true`, und zwar mit dem **Original**-Wert: die GUI zeigt immer
den Nutzer-Sollwert, nicht das Formel-Ergebnis.

**Richtig, wenn** die Gruppe wie ein echtes Gerät wirken soll: die
Devices-GUI erkennt sie als vollwertiges Gerät der Profil-Klasse, auch
für andere Adapter (Matter, Alexa) nicht von einem Einzelgerät zu
unterscheiden. **Preis:** höchste Komplexität — und das Skript muss
dauerhaft laufen, sonst verteilt niemand die Werte. Der angezeigte Wert
ist der zuletzt geschriebene Sollwert, nicht der echte Zustand der
Mitglieder (es gibt bewusst keinen Rückkanal).

## Andere Geräteklassen

Neue Geräteklassen brauchen nur einen weiteren Eintrag in
`gruppen-vorlagen.json` — am Skript ändert sich nichts, denn keine
Variante hat harte Typ-Annahmen:

- **A** ist von Natur aus typ-agnostisch: die Szenen-Objekte sind immer
  Boolean-Taster, nur die Zielwerte `wertZu`/`wertAuf` müssen zum Profil
  passen (das Skript warnt bei Abweichung). Ein Schalter-Paar hätte
  z.B. `true`/`false`.
- **B** kopiert Werte 1:1 (`virtualGroup`), das Szenen-Objekt bleibt
  `type: "mixed"` — nur die Rolle kommt aus dem Profil, damit die
  Devices-GUI die richtige Kachel rendert.
- **C** bezieht Typ, Rolle, State-Name, Kanal-Rolle und die optionalen
  `unit`/`min`/`max`/`def` vollständig aus dem Profil; der Fan-out-Trigger
  reicht Werte nur durch und ist damit typ-neutral.

Die einzige harte Randbedingung sind die Rollen: sie müssen den
Erkennungsmustern des
[ioBroker type-detectors](https://github.com/ioBroker/ioBroker.type-detector)
entsprechen, sonst erkennt der Devices-Adapter die Geräteklasse nicht.
Für die mitgelieferten Profile (gegen den type-detector-Quellcode
verifiziert): Jalousie erwartet einen beschreibbaren number-State mit
Rolle `level.blind`, Steckdose/Schalter einen beschreibbaren
boolean-State mit Rolle `switch`, Dimmer einen beschreibbaren
number-State mit Rolle `level.dimmer`.

### Formel-Kette

Bei Variante C können zwei Formeln nacheinander greifen: erst die
Gruppen-`formel` (Gruppen-Sollwert → Wert für die Mitglieder), dann die
`schreiben`-Formel des jeweiligen Alias (Alias-`SET` → Gerät). Die
Alias-Formeln greifen weiterhin automatisch, weil die Mitglieder auf die
Alias-`SET`-States zeigen — die Gruppen-`formel` ist also nur für
Transformationen auf Gruppen-Ebene nötig (z.B. Invertierung), nicht um
Geräte-Eigenheiten auszugleichen.

## Beispiele: Jalousie und Licht in allen drei Varianten

Sechs Gruppen, die dieselben zwei Geräteklassen durch alle drei
Varianten durchspielen — die Jalousie mit Auf/Zu-Tastern und
Positions-Slider, das Licht mit An/Aus-Tastern und Helligkeits-Slider.
Die Mitglieds-IDs sind Platzhalter und müssen auf echte Alias-States
zeigen.

### Jalousie

**Variante A — Auf/Zu-Taster** (`wertZu: 100` = Position „ganz zu",
`wertAuf: 0` = Position „ganz auf"):

```json
{
  "gruppe": "Jalousien_og_taster",
  "name": "Jalousien OG",
  "variante": "A",
  "profil": "jalousie",
  "raum": "Obergeschoss",
  "funktion": "Jalousie",
  "wertZu": 100,
  "wertAuf": 0,
  "formel": null,
  "mitglieder": [
    "alias.0.scripted aliases.JalousieSchlafzimmer.SET",
    "alias.0.scripted aliases.JalousieArbeitszimmer.SET"
  ]
}
```

**Ergebnis:** zwei Szenen-Objekte `scene.0.Jalousien_og_taster_zu` und
`…_auf`. Die Devices-GUI zeigt zwei Button-Kacheln „Jalousien OG zu"
und „Jalousien OG auf"; ein Druck auf „zu" schreibt 100 auf alle
Mitglieder, „auf" schreibt 0. Kein Slider, keine Zwischenpositionen.

**Variante B — Positions-Slider** (virtuelle Gruppe):

```json
{
  "gruppe": "Jalousien_og_position",
  "name": "Jalousien OG Position",
  "variante": "B",
  "profil": "jalousie",
  "raum": "Obergeschoss",
  "funktion": "Jalousie",
  "wertZu": null,
  "wertAuf": null,
  "formel": null,
  "mitglieder": [
    "alias.0.scripted aliases.JalousieSchlafzimmer.SET",
    "alias.0.scripted aliases.JalousieArbeitszimmer.SET"
  ]
}
```

**Ergebnis:** ein Szenen-Objekt `scene.0.Jalousien_og_position` mit
Rolle `level.blind` und `virtualGroup`. Die GUI zeigt eine
Jalousie-Kachel mit Slider 0–100 %; der eingestellte Wert wird vom
Szenen-Adapter 1:1 auf alle Mitglieder kopiert. Fährt jemand ein
Mitglied einzeln, wird die Gruppe *uncertain* (siehe unten).

**Variante C — vollwertiges Jalousie-Gerät:**

```json
{
  "gruppe": "Jalousien_og",
  "name": "Jalousien OG",
  "variante": "C",
  "profil": "jalousie",
  "raum": "Obergeschoss",
  "funktion": "Jalousie",
  "wertZu": null,
  "wertAuf": null,
  "formel": null,
  "mitglieder": [
    "alias.0.scripted aliases.JalousieSchlafzimmer.SET",
    "alias.0.scripted aliases.JalousieArbeitszimmer.SET"
  ]
}
```

**Ergebnis:** ein Halter-State `0_userdata.0.Gruppen.Jalousien_og_soll`
und ein Alias-Kanal `alias.0.Gruppen.Jalousien_og` (Kanal-Rolle
`blind`) mit State `LEVEL` (Rolle `level.blind`, 0–100 %). Die GUI —
und auch Matter/Alexa — sieht eine ganz normale Jalousie mit
Positions-Slider; der Fan-out-Trigger verteilt jeden Sollwert auf die
Mitglieder. Das Skript muss dafür dauerhaft laufen.

### Licht (Dimmer)

Die Mitglieder sind hier Dimmer-Aliase mit einem number-`SET`
(0–100 %). Für reine Schalt-Aktoren ohne Dimmen gilt dasselbe Muster
mit `"profil": "schalter"` und `true`/`false` statt 100/0.

**Variante A — An/Aus-Taster** (`wertAuf: 100` = an,
`wertZu: 0` = aus):

```json
{
  "gruppe": "Licht_wohnzimmer_taster",
  "name": "Licht Wohnzimmer",
  "variante": "A",
  "profil": "dimmer",
  "raum": "Wohnzimmer",
  "funktion": "Licht",
  "wertZu": 0,
  "wertAuf": 100,
  "formel": null,
  "mitglieder": [
    "alias.0.scripted aliases.DeckenlampeWohnzimmer.SET",
    "alias.0.scripted aliases.StehlampeWohnzimmer.SET"
  ]
}
```

**Ergebnis:** zwei Button-Kacheln. Achtung Benennung: die Taster
heißen technisch immer `…_zu`/`…_auf` — beim Licht bedeutet „auf"
also *an* (schreibt 100) und „zu" *aus* (schreibt 0). Kein Slider.

**Variante B — Helligkeits-Slider** (virtuelle Gruppe):

```json
{
  "gruppe": "Licht_wohnzimmer_helligkeit",
  "name": "Licht Wohnzimmer Helligkeit",
  "variante": "B",
  "profil": "dimmer",
  "raum": "Wohnzimmer",
  "funktion": "Licht",
  "wertZu": null,
  "wertAuf": null,
  "formel": null,
  "mitglieder": [
    "alias.0.scripted aliases.DeckenlampeWohnzimmer.SET",
    "alias.0.scripted aliases.StehlampeWohnzimmer.SET"
  ]
}
```

**Ergebnis:** ein Szenen-Objekt `scene.0.Licht_wohnzimmer_helligkeit`
mit Rolle `level.dimmer`. Die GUI zeigt eine Dimmer-Kachel mit
Helligkeits-Slider 0–100 %; der Wert geht 1:1 an beide Lampen.
Gleiche `uncertain`-Mechanik wie bei der Jalousie.

**Variante C — vollwertiges Dimmer-Gerät:**

```json
{
  "gruppe": "Licht_wohnzimmer",
  "name": "Licht Wohnzimmer",
  "variante": "C",
  "profil": "dimmer",
  "raum": "Wohnzimmer",
  "funktion": "Licht",
  "wertZu": null,
  "wertAuf": null,
  "formel": null,
  "mitglieder": [
    "alias.0.scripted aliases.DeckenlampeWohnzimmer.SET",
    "alias.0.scripted aliases.StehlampeWohnzimmer.SET"
  ]
}
```

**Ergebnis:** Halter `0_userdata.0.Gruppen.Licht_wohnzimmer_soll` und
Alias-Kanal `alias.0.Gruppen.Licht_wohnzimmer` (Kanal-Rolle `light`)
mit State `LEVEL` (Rolle `level.dimmer`, 0–100 %). Die GUI erkennt
einen echten Dimmer mit Helligkeits-Slider — die meisten
Visualisierungen rendern dazu automatisch auch einen An/Aus-Schalter
(an = letzter Wert bzw. 100, aus = 0). Wie bei der Jalousie verteilt
der Trigger die Werte, das Skript muss laufen.

**Hinweis zur Kombination:** Taster (A) und Slider (B oder C) derselben
Geräte schließen sich nicht aus — einfach zwei Gruppen mit
unterschiedlichem `gruppe`-Namen auf dieselben Mitglieder zeigen
lassen, wie oben `Jalousien_og_taster` + `Jalousien_og`.

## Was zeigt die Devices-Auto-GUI?

- **A:** zwei Button-Kacheln („… zu", „… auf") im zugewiesenen Raum.
- **B:** eine Kachel mit Slider/Schalter; die Erkennung der Geräteklasse
  hängt an der Profil-Rolle des Szenen-Objekts.
- **C:** eine normale Geräte-Kachel der Profil-Klasse (Jalousie mit
  Slider, Steckdose mit Schalter, …).

## `uncertain`-Verhalten bei Variante B

Der Szenen-Adapter vergleicht laufend die Ist-Werte aller Mitglieder mit
dem Gruppenwert. Solange alle Mitglieder denselben Wert haben, zeigt die
Gruppe diesen Wert. Fährt jemand ein einzelnes Mitglied separat
(Einzel-Slider, Wandtaster), laufen die Werte auseinander und die Gruppe
gilt als *uncertain*: sie zeigt keinen verlässlichen gemeinsamen Wert
mehr, GUIs stellen das je nach Visualisierung als unbestimmt/leer dar.
Das ist kein Fehler, sondern die ehrliche Antwort auf „die Gruppe hat
gerade keinen einheitlichen Zustand". Der nächste Schreibvorgang auf die
Gruppe synchronisiert alle Mitglieder wieder.

## Delete-and-rebuild und Marker

Anders als der Alias-Aufbau (Upsert) arbeitet `gruppen-aufbau.js` mit
Delete-and-rebuild: Bei jedem Lauf werden zuerst alle Objekte mit dem
Marker `native.gruppenAufbau === true` unter `scene.0.*`,
`alias.0.Gruppen.*` und `0_userdata.0.Gruppen.*` gelöscht (inklusive
Bereinigung der Enum-Mitgliedschaften; beim rekursiven Löschen eines
Alias-Kanals werden dafür alle Kind-States mit erfasst — der State-Name
hängt ja vom Profil ab) und danach aus `gruppen.json` neu aufgebaut.
Das ist hier unkritisch, weil an den Gruppen-Objekten — anders als an
den Geräte-Aliasen — keine Devices-Konfiguration hängt, die einen
Löschvorgang nicht überleben würde.

- Von Hand angelegte Szenen und fremde States tragen den Marker nicht
  und bleiben unangetastet.
- Enums und die Ordner-Objekte (`…Gruppen`) werden nie gelöscht;
  fehlende Enums legt das Skript mit Warnung neu an (Auflösung: erst
  exakte ID wie `enum.rooms.Zentrale`, dann Namens-Vergleich).
- Die Objekte von `alias-aufbau.js` (Marker `common.custom.aliasAufbau`)
  sind davon vollständig getrennt.

## Arbeitsablauf

0. `gruppen-vorlagen.json` zusammen mit `gruppen.json` in den
   Dateispeicher nach `0_userdata.0/configuration.read.by.scripts/`
   hochladen.
1. `gruppen.json` pflegen: jede Gruppe braucht ein `profil` aus
   `gruppen-vorlagen.json`.
2. `gruppen-aufbau.js` als Javascript-Skript unter `common` anlegen und
   starten. Bei Variante C muss das Skript dauerhaft laufen (nicht nur
   einmalig), sonst fehlt der Fan-out-Trigger.
3. Gruppe ändern oder entfernen: `gruppen.json` anpassen, Skript neu
   starten — verschwundene Gruppen werden mitsamt Enum-Einträgen
   aufgeräumt. Gleiches gilt für Profil-Änderungen in
   `gruppen-vorlagen.json`.

Hinweis zum Zusammenspiel mit dem Dummy-Modus: Die Mitglieder zeigen auf
die Alias-States, nicht auf die Geräte dahinter. Eine Gruppe funktioniert
daher in beiden Modi unverändert — im Dummy-Modus bewegt sie eben die
Dummy-States.
