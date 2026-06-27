// ============================================================================
// GLOBALES SKRIPT: global-alias-engine
//
// Im Skripte-Baum in einem Ordner namens "global" ablegen (Klartext-Name,
// keine Checkbox) - Skripte darin werden vor allen anderen Skripten
// ausgeführt, ihre Funktionen/Konstanten stehen danach überall zur Verfügung.
// Muss wie jedes Skript gestartet (aktiviert) sein.
//
// Enthält die komplette, tabellengesteuerte Alias-Erzeugung:
//   - parseCsv / splitCsvLine / serializeCsv : CSV-Werkzeuge
//   - buildAllInstances()                    : liest beide Tabellen, baut alle Aliase
//
// Genutzt von: alias-builder.js, migration-anwenden.js
// ============================================================================

const FILE_ADAPTER = '0_userdata.0';
const FILE_PROFILES = 'mapping/profile-definitionen.csv';
const FILE_INSTANCES = 'mapping/geraete-instanzen.csv';

const PLACEHOLDER = '__BITTE_AUSFUELLEN__';

// Rein kosmetisch: Rolle des Channel-Objekts je Zieltyp. Keine Pflichtbedingung
// des type-detectors, beeinflusst nur das Icon im Objektbaum.
const CHANNEL_ROLE_BY_TARGET_TYPE = {
    blind: 'blind',
    window: 'window',
    windowTilt: 'window',
};

// --- Öffentlicher Einstiegspunkt --------------------------------------------

async function buildAllInstances() {
    let profileRows;
    let instanceRows;
    try {
        profileRows = parseCsv(await readFileAsync(FILE_ADAPTER, FILE_PROFILES));
        instanceRows = parseCsv(await readFileAsync(FILE_ADAPTER, FILE_INSTANCES));
    } catch (err) {
        log(`Konnte CSV-Dateien nicht lesen (liegen sie unter ${FILE_ADAPTER}/mapping/?): ${err}`, 'error');
        return;
    }

    const profiles = groupByProfile(profileRows);

    for (const instance of instanceRows) {
        await buildInstance(instance, profiles);
    }

    log('Alias-Aufbau abgeschlossen.', 'info');
}

// --- CSV ----------------------------------------------------------------------

function parseCsv(text) {
    const lines = text
        .toString()
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));

    if (!lines.length) return [];

    const header = splitCsvLine(lines[0]);
    return lines.slice(1).map(line => {
        const cells = splitCsvLine(line);
        const row = {};
        header.forEach((key, i) => (row[key] = cells[i] !== undefined ? cells[i] : ''));
        return row;
    });
}

function splitCsvLine(line) {
    // Einfacher, aber korrekter CSV-Split für Semikolon-Trennung mit
    // optionalen Anführungszeichen ("..."), inkl. "" als Escape für ein
    // literales Anführungszeichen innerhalb eines Feldes.
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQuotes) {
            if (c === '"' && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else if (c === '"') {
                inQuotes = false;
            } else {
                cur += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ';') {
            out.push(cur.trim());
            cur = '';
        } else {
            cur += c;
        }
    }
    out.push(cur.trim());
    return out;
}

function serializeCsv(rows, header) {
    const escape = val => {
        const s = val === undefined || val === null ? '' : String(val);
        return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(';')];
    for (const row of rows) {
        lines.push(header.map(h => escape(row[h])).join(';'));
    }
    return lines.join('\n');
}

// --- Aufbau -------------------------------------------------------------------

function groupByProfile(rows) {
    const profiles = {};
    for (const row of rows) {
        profiles[row.Profil] = profiles[row.Profil] || [];
        profiles[row.Profil].push(row);
    }
    return profiles;
}

function resolveSourceId(basePath, field) {
    const suffix = field['Quell-Suffix'];
    if (!suffix || suffix === PLACEHOLDER) return null;
    return `${basePath}.${suffix}`;
}

async function buildInstance(instance, profiles) {
    const aliasId = `alias.0.${instance.AliasName}`;
    const fields = profiles[instance.Profil];

    if (!fields) {
        log(`Profil "${instance.Profil}" (für ${instance.AliasName}) nicht in profile-definitionen.csv gefunden - übersprungen.`, 'error');
        return;
    }

    // 1. Validieren: jedes Pflichtfeld braucht einen echten, existierenden Quell-State
    let valid = true;
    for (const f of fields) {
        if (f.Pflicht.toLowerCase() !== 'ja') continue;

        const sourceId = resolveSourceId(instance.BasisPfad, f);
        if (sourceId === null) {
            log(`Pflichtfeld "${instance.Profil}/${f.Feld}" hat noch keinen Quell-Pfad (Platzhalter in profile-definitionen.csv) - ${instance.AliasName} übersprungen.`, 'error');
            valid = false;
            continue;
        }
        const obj = await getObjectAsync(sourceId);
        if (!obj) {
            log(`Pflicht-Quell-State fehlt: ${sourceId} (${instance.AliasName}/${f.Feld}) - ${instance.AliasName} übersprungen.`, 'error');
            valid = false;
        }
    }
    if (!valid) return;

    // 2. Bestehenden Alias-Channel vollständig entfernen (macht das Skript wiederholbar)
    if (await getObjectAsync(aliasId)) {
        await deleteObjectAsync(aliasId, true); // rekursiv
        log(`Bestehenden Alias entfernt: ${aliasId}`, 'info');
    }

    // 3. Channel anlegen
    const zieltyp = fields[0] ? fields[0].Zieltyp : '';
    await setObjectAsync(aliasId, {
        type: 'channel',
        common: {
            name: instance.AliasName,
            role: CHANNEL_ROLE_BY_TARGET_TYPE[zieltyp] || zieltyp,
        },
        native: {},
    });

    // 4. States gemäss Profil anlegen
    for (const f of fields) {
        const sourceId = resolveSourceId(instance.BasisPfad, f);
        if (sourceId === null) continue; // optionales Feld ohne Quelle -> einfach weglassen

        const obj = await getObjectAsync(sourceId);
        if (!obj) {
            log(`Optionaler Quell-State fehlt, Feld übersprungen: ${sourceId} (${instance.AliasName}/${f.Feld})`, 'warn');
            continue;
        }

        const common = {
            name: f.Feld,
            role: f.Zielrolle,
            type: f.Datentyp,
            read: f.Lesbar.toLowerCase() === 'true',
            write: f.Schreibbar.toLowerCase() === 'true',
            alias: { id: sourceId },
        };
        if (f.Unit) common.unit = f.Unit;
        if (f.Min !== '') common.min = Number(f.Min);
        if (f.Max !== '') common.max = Number(f.Max);
        if (f['Lese-Konverter']) common.alias.read = f['Lese-Konverter'];
        if (f['Schreib-Konverter']) common.alias.write = f['Schreib-Konverter'];

        await setObjectAsync(`${aliasId}.${f.Feld}`, { type: 'state', common, native: {} });
    }

    log(`Alias "${aliasId}" (Profil ${instance.Profil}, Zieltyp ${zieltyp}) angelegt/ersetzt.`, 'info');
}
