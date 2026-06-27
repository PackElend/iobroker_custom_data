// ============================================================================
// alias-builder
//
// Dünner Aufrufer: die eigentliche Logik steckt im globalen Skript
// "global-alias-engine" (Ordner "global" im Skripte-Baum, muss aktiv sein).
//
// Einrichtung:
//   1. Admin -> Objekte -> Dateien -> 0_userdata.0 -> Ordner "mapping" anlegen
//   2. profile-definitionen.csv und geraete-instanzen.csv dort hineinziehen
//   3. global-alias-engine.js in einen Ordner "global" im Skripte-Baum legen,
//      als Typ "Javascript" speichern und starten
//   4. Dieses Skript ebenfalls starten - läuft einmal durch und beendet sich
//
// Erneut ausführen, wann immer sich eine der beiden Tabellen ändert.
// ============================================================================

buildAllInstances();
