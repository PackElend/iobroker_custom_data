// ============================================================================
// migration-anwenden
//
// Für den Fall, dass sich Datenpunkte am Gerät ändern (z.B. nach einem
// Firmware-Update von zwave-js/zwavews). Liest migrationen.csv
// (Profil;Feld;AlteQuelle;NeueQuelle), patcht die betroffene(n) Zeile(n) in
// profile-definitionen.csv, schreibt die Tabelle zurück und baut danach ALLE
// Aliase über das globale Skript "global-alias-engine" neu auf.
//
// Sicherheitscheck: Eine Migration wird nur angewendet, wenn der aktuelle
// Quell-Suffix in der Tabelle exakt der angegebenen "AlteQuelle" entspricht.
// Bei Abweichung wird gewarnt und NICHT überschrieben - Schutz davor, eine
// veraltete/falsche Migrationszeile versehentlich erneut anzuwenden.
//
// Voraussetzung: global-alias-engine.js (Ordner "global") ist aktiv.
// ============================================================================

const FILE_ADAPTER = '0_userdata.0';
const FILE_PROFILES = 'mapping/profile-definitionen.csv';
const FILE_MIGRATIONS = 'mapping/migrationen.csv';

main();

async function main() {
    const migrations = parseCsv(await readFileAsync(FILE_ADAPTER, FILE_MIGRATIONS));
    if (!migrations.length) {
        log('Keine (aktiven) Migrationen in migrationen.csv gefunden - nichts zu tun.', 'info');
        return;
    }

    const profileText = (await readFileAsync(FILE_ADAPTER, FILE_PROFILES)).toString();
    const header = splitCsvLine(profileText.split(/\r?\n/)[0]);
    const profileRows = parseCsv(profileText);

    let changed = 0;
    for (const m of migrations) {
        const row = profileRows.find(r => r.Profil === m.Profil && r.Feld === m.Feld);
        if (!row) {
            log(`Migration ohne passende Zeile: Profil "${m.Profil}", Feld "${m.Feld}" nicht in profile-definitionen.csv gefunden.`, 'error');
            continue;
        }
        if (row['Quell-Suffix'] !== m.AlteQuelle) {
            log(`Migration übersprungen: ${m.Profil}/${m.Feld} hat aktuell "${row['Quell-Suffix']}", erwartet wurde "${m.AlteQuelle}" - bitte prüfen.`, 'warn');
            continue;
        }
        row['Quell-Suffix'] = m.NeueQuelle;
        changed++;
        log(`${m.Profil}/${m.Feld}: "${m.AlteQuelle}" -> "${m.NeueQuelle}"`, 'info');
    }

    if (!changed) {
        log('Keine Migration angewendet (0 Treffer).', 'info');
        return;
    }

    await writeFileAsync(FILE_ADAPTER, FILE_PROFILES, serializeCsv(profileRows, header));
    log(`profile-definitionen.csv aktualisiert (${changed} Feld(er)). Baue Aliase neu auf ...`, 'info');

    await buildAllInstances(); // aus dem globalen Skript "global-alias-engine"
}
