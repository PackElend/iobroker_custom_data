---
title: Gruppen-Beispiele — Licht und Jalousie in allen drei Varianten
sidebar_label: Gruppen-Beispiele
description: Je Variante (A, B, C) eine Jalousien- und eine Licht-Gruppe mit Auf/Zu bzw. An/Aus und Slider — Konfiguration und was dabei herauskommt.
---

# Gruppen-Beispiele: Licht und Jalousie in allen drei Varianten

Diese Seite spielt die drei Varianten aus
[gruppen-steuerung.md](gruppen-steuerung.md) je einmal mit einer
**Jalousien-Gruppe** (Auf/Zu + Positions-Slider) und einer **Licht-Gruppe**
(An/Aus + Helligkeits-Slider) durch. Jedes Beispiel ist ein
kopierfertiger Eintrag für `gruppen.json`, gefolgt vom Ergebnis: welche
Objekte entstehen und was die Devices-Auto-GUI daraus macht.

Vorab die ehrliche Übersicht, was jede Variante von der Wunschliste
„An/Aus (bzw. Auf/Zu) **und** Slider" tatsächlich liefert:

| Variante | Auf/Zu bzw. An/Aus | Slider (Position/Helligkeit) |
|---|---|---|
| A | ✔ zwei eigene Taster-Kacheln | ✘ prinzipbedingt nicht möglich |
| B | ✔ über die Gruppen-Kachel (Toggle bzw. Endposition des Sliders) | ✔ |
| C | ✔ über die Geräte-Kachel (Toggle bzw. Endposition des Sliders) | ✔ |

## Voraussetzungen

- **Profile:** Beide benutzten Profile sind in `gruppen-vorlagen.json`
  bereits mitgeliefert — `jalousie` (number, `level.blind`, Slider =
  Position in %) und `dimmer` (number, `level.dimmer`, Slider =
  Helligkeit in %).
- **Jalousien-Mitglieder:** Die Beispiele verwenden die real vorhandenen
  skriptgebauten Aliase aus `mapping.json`
  (`alias.0.scripted aliases.Jalousie….SET`).
- **Licht-Mitglieder:** Im aktuellen Setup gibt es noch keine
  Licht-Aliase — die IDs `alias.0.scripted aliases.Licht….SET` sind
  **Platzhalter**. Damit sie existieren, braucht `vorlagen.json` eine
  Licht-Vorlage (Pflicht-Feld `SET` als beschreibbarer number-State mit
  Rolle `level.dimmer`) plus passende Einträge in `mapping.json` —
  alternativ können die Mitglieder direkt auf beschreibbare Dimmer-States
  eines Adapters zeigen. Solange die IDs fehlen, überspringt
  `gruppen-aufbau.js` sie mit Warnung; hat eine Gruppe gar kein
  existierendes Mitglied, wird sie ausgelassen.

## Variante A — Szene als Taster

### A · Jalousie: „Alle Jalousien" mit Auf/Zu

```json
{
  "gruppe": "Jalousien_taster",
  "name": "Alle Jalousien",
  "variante": "A",
  "profil": "jalousie",
  "raum": "Zentrale",
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

**Ergebnis:** Es entstehen zwei Boolean-Szenen
`scene.0.Jalousien_taster_zu` und `scene.0.Jalousien_taster_auf`
(Rolle `scene.state`, Engine `scenes.0`), beide in den Enums
`Zentrale`/`Jalousie`. Die Devices-Auto-GUI zeigt **zwei Button-Kacheln**
„Alle Jalousien zu" und „Alle Jalousien auf". Ein Druck auf „zu" schreibt
`100` auf die `SET`-States aller Mitglieder (der Szenen-Adapter führt das
aus, kein JS nötig), „auf" schreibt `0`. Die `schreiben`-Formeln der
Aliase greifen danach ganz normal.

**Kein Slider:** Variante A kann prinzipbedingt keine Zwischenpositionen —
es gibt nur die zwei festen Zielwerte. Wer zusätzlich einen
Positions-Slider will, legt auf denselben Mitgliedern eine **zweite**
Gruppe als Variante B oder C an (anderer `gruppe`-Name, sonst identisch);
die Varianten vertragen sich problemlos nebeneinander.

### A · Licht: „Wohnzimmerlicht" mit An/Aus

```json
{
  "gruppe": "Licht_wohnzimmer_taster",
  "name": "Wohnzimmerlicht",
  "variante": "A",
  "profil": "dimmer",
  "raum": "Wohnzimmer",
  "funktion": "Licht",
  "wertZu": 0,
  "wertAuf": 100,
  "formel": null,
  "mitglieder": [
    "alias.0.scripted aliases.LichtWohnzimmerDecke.SET",
    "alias.0.scripted aliases.LichtWohnzimmerRegal.SET"
  ]
}
```

**Ergebnis:** Zwei Button-Kacheln `scene.0.Licht_wohnzimmer_taster_zu`
und `…_auf`. Die Zuordnung ist hier gedanklich zu übersetzen: der
**„zu"-Taster ist „Aus"** (`wertZu: 0` = 0 % Helligkeit), der
**„auf"-Taster ist „An"** (`wertAuf: 100` = volle Helligkeit). Die
Taster-Suffixe und -Beschriftungen (`_zu`/`_auf`, „… zu"/„… auf") sind im
Skript fest verdrahtet — die Kacheln heißen also „Wohnzimmerlicht zu" und
„Wohnzimmerlicht auf", was bei Lichtern sprachlich holpert, funktional
aber genau An/Aus ist. Statt `100` kann `wertAuf` auch eine gedimmte
Einschalt-Helligkeit sein (z.B. `40` für Abendlicht). Ein
Helligkeits-Slider ist wie bei der Jalousie in Variante A nicht möglich.

Nebenbemerkung: Für **nicht dimmbare** Lichter (Boolean-Schaltaktoren)
wäre dasselbe Beispiel mit `"profil": "schalter"`, `"wertZu": false`,
`"wertAuf": true` zu schreiben — das Skript warnt, wenn die Werte nicht
zum `typ` des Profils passen.

## Variante B — virtuelle Gruppe

### B · Jalousie: „Jalousien Schlafzimmer" mit Positions-Slider

```json
{
  "gruppe": "Jalousien_gruppe",
  "name": "Jalousien Schlafzimmer",
  "variante": "B",
  "profil": "jalousie",
  "raum": "Schlafzimmer",
  "funktion": "Jalousie",
  "wertZu": null,
  "wertAuf": null,
  "formel": null,
  "mitglieder": [
    "alias.0.scripted aliases.JalousieSchlafzimmer.SET",
    "alias.0.scripted aliases.BalkontürSchalfzimmer.SET"
  ]
}
```

**Ergebnis:** Ein einziges Objekt `scene.0.Jalousien_gruppe` mit
`native.virtualGroup: true`, Rolle `level.blind` (aus dem Profil) und
Typ `mixed`. Die Devices-Auto-GUI erkennt an der Rolle eine Jalousie und
zeigt **eine Kachel mit Positions-Slider (0–100 %)**. Jeder geschriebene
Wert wird vom Szenen-Adapter 1:1 auf die `SET`-States aller Mitglieder
kopiert — stufenlos, ohne JS. „Auf" und „Zu" sind die Endpositionen:
Slider auf 0 % bzw. 100 % ziehen (Visualisierungen, die bei
Jalousien-Kacheln Pfeil-Buttons anbieten, schreiben dabei intern genau
diese Endwerte auf denselben State).

**Rücklesen:** Solange alle Mitglieder denselben Wert haben, zeigt die
Kachel diesen Wert. Fährt jemand eine einzelne Jalousie separat, gilt die
Gruppe als *uncertain* und zeigt keinen verlässlichen Wert mehr — der
nächste Schreibvorgang auf die Gruppe synchronisiert wieder (Details im
Abschnitt „uncertain" in [gruppen-steuerung.md](gruppen-steuerung.md)).

### B · Licht: „Wohnzimmerlicht" mit An/Aus und Helligkeits-Slider

```json
{
  "gruppe": "Licht_wohnzimmer_gruppe",
  "name": "Wohnzimmerlicht",
  "variante": "B",
  "profil": "dimmer",
  "raum": "Wohnzimmer",
  "funktion": "Licht",
  "wertZu": null,
  "wertAuf": null,
  "formel": null,
  "mitglieder": [
    "alias.0.scripted aliases.LichtWohnzimmerDecke.SET",
    "alias.0.scripted aliases.LichtWohnzimmerRegal.SET"
  ]
}
```

**Ergebnis:** Ein Objekt `scene.0.Licht_wohnzimmer_gruppe` mit Rolle
`level.dimmer`. Die GUI rendert die **Dimmer-Kachel: An/Aus-Toggle plus
Helligkeits-Slider** — beides bedient denselben State. Der Slider
schreibt die Helligkeit in %, der Toggle schreibt 0 („Aus") bzw. 100 oder
den letzten Wert („An", je nach Visualisierung). Jeder Wert landet 1:1
auf allen Mitglieds-`SET`-States. Es gilt dasselbe *uncertain*-Verhalten
wie bei der Jalousie: dimmt jemand eine einzelne Lampe anders, zeigt die
Gruppen-Kachel keinen gemeinsamen Wert mehr, bis wieder auf die Gruppe
geschrieben wird.

Gegenüber A gewinnt man also den Slider und den Toggle in **einer**
Kachel, ohne zusätzliche Objekte und ohne dauerhaft laufendes Skript.

## Variante C — Alias mit JS-Fan-out

### C · Jalousie: „Jalousien Kinder- und Arbeitszimmer" als vollwertiges Gerät

```json
{
  "gruppe": "Jalousien_alias",
  "name": "Jalousien Kinder- und Arbeitszimmer",
  "variante": "C",
  "profil": "jalousie",
  "raum": "Zentrale",
  "funktion": "Jalousie",
  "wertZu": null,
  "wertAuf": null,
  "formel": null,
  "mitglieder": [
    "alias.0.scripted aliases.JalousieKinderzimmmer.SET",
    "alias.0.scripted aliases.JalousieArbeitszimmer.SET"
  ]
}
```

**Ergebnis:** Drei Bausteine entstehen:

1. Halter-State `0_userdata.0.Gruppen.Jalousien_alias_soll`
   (number, `level.blind`, %, 0–100),
2. Alias-Kanal `alias.0.Gruppen.Jalousien_alias` (Kanal-Rolle `blind`)
   mit dem State `LEVEL`, der lesend und schreibend auf den Halter zeigt,
3. ein JS-Trigger im laufenden `gruppen-aufbau.js`, der jeden
   Schreibvorgang (`ack=false`) auf den Halter an beide Mitglieder
   verteilt und den Halter danach mit dem Original-Wert `ack=true`
   bestätigt.

Die Devices-GUI zeigt eine **normale Jalousien-Geräte-Kachel** mit
Positions-Slider; Auf/Zu sind wieder die Endwerte 0 %/100 % auf demselben
`LEVEL`-State. Anders als bei B ist die Gruppe auch für andere Adapter
(Matter, Alexa) nicht von einem echten Einzelgerät zu unterscheiden. Die
Kachel zeigt immer den **zuletzt geschriebenen Sollwert** — es gibt
bewusst keinen Rückkanal, also auch kein *uncertain*, aber ebenso keine
Anzeige, wenn eine einzelne Jalousie separat verfahren wurde. **Das
Skript muss dauerhaft laufen**, sonst verteilt niemand die Werte.

Optional kann hier `formel` gesetzt werden, z.B. `"100 - val"`, falls die
Gruppen-Richtung invertiert werden soll — die GUI zeigt trotzdem den
unveränderten Nutzer-Sollwert, nur die Mitglieder bekommen den
transformierten Wert.

### C · Licht: „Wohnzimmerlicht" als vollwertiger Dimmer

```json
{
  "gruppe": "Licht_wohnzimmer_alias",
  "name": "Wohnzimmerlicht",
  "variante": "C",
  "profil": "dimmer",
  "raum": "Wohnzimmer",
  "funktion": "Licht",
  "wertZu": null,
  "wertAuf": null,
  "formel": null,
  "mitglieder": [
    "alias.0.scripted aliases.LichtWohnzimmerDecke.SET",
    "alias.0.scripted aliases.LichtWohnzimmerRegal.SET"
  ]
}
```

**Ergebnis:** Analog zur Jalousie, nur mit den Dimmer-Werten aus dem
Profil: Halter `0_userdata.0.Gruppen.Licht_wohnzimmer_alias_soll`
(number, `level.dimmer`, %, 0–100), Alias-Kanal
`alias.0.Gruppen.Licht_wohnzimmer_alias` mit **Kanal-Rolle `light`** und
State `LEVEL`, dazu der Fan-out-Trigger. Die GUI erkennt einen
vollwertigen **Dimmer: An/Aus-Toggle plus Helligkeits-Slider** in einer
Geräte-Kachel — der Toggle schreibt 0 bzw. 100/letzten Wert, der Slider
die Ziel-Helligkeit, der Trigger verteilt alles an die Mitglieder.
Angezeigt wird auch hier der letzte Sollwert, nicht der echte Zustand
der einzelnen Lampen; und das Skript muss dauerhaft laufen.

## Wann welche Variante?

- **Nur An/Aus bzw. Auf/Zu** reicht → **A**: minimalste Objekte, kein
  laufendes JS, aber zwei Kacheln und kein Slider.
- **Slider + Toggle in einer Kachel**, Skript darf nach dem Aufbau
  stoppen → **B**: ein Szenen-Objekt, 1:1-Kopie, dafür das
  *uncertain*-Verhalten beim Rücklesen.
- **Die Gruppe soll wie ein echtes Gerät wirken** (auch für
  Matter/Alexa) → **C**: volle Geräte-Kachel, optionale `formel`, dafür
  dauerhaft laufendes Skript und Anzeige = letzter Sollwert.
