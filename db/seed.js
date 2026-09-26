// Populates the SLSEA database with a plausible, FK-consistent dataset.
// Run with: npm run seed  (fails if data exists)
// npm run seed:reset (wipes and reseeds)

const pool = require("../src/db"); // reuse the app's connection pool
const bcrypt = require("bcryptjs");

// 9 provinces of Sri Lanka
const PROVINCES = [
  "Western", "Central", "Southern", "Northern", "Eastern",
  "North Western", "North Central", "Uva", "Sabaragamuwa",
];

// 25 districts → province (index into PROVINCES)
const DISTRICTS = [
  ["Colombo", 0], ["Gampaha", 0], ["Kalutara", 0],
  ["Kandy", 1], ["Matale", 1], ["Nuwara Eliya", 1],
  ["Galle", 2], ["Matara", 2], ["Hambantota", 2],
  ["Jaffna", 3], ["Kilinochchi", 3], ["Mannar", 3],
  ["Vavuniya", 3], ["Mullaitivu", 3],
  ["Batticaloa", 4], ["Ampara", 4], ["Trincomalee", 4],
  ["Kurunegala", 5], ["Puttalam", 5],
  ["Anuradhapura", 6], ["Polonnaruwa", 6],
  ["Badulla", 7], ["Monaragala", 7],
  ["Ratnapura", 8], ["Kegalle", 8],
];

const INSTALLATIONS_PER_SUBSTATION = 9;    // 25 × 9 = 225 installations
const DAYS_OF_READINGS  = 7;
const INTERVAL_MINUTES  = 15;
const READINGS_PER_DAY  = (24 * 60) / INTERVAL_MINUTES;  // 96
const TOTAL_READINGS =
  INSTALLATIONS_PER_SUBSTATION * 25 * DAYS_OF_READINGS * READINGS_PER_DAY;

const OWNER_PREFIXES = ["Ceylon", "Lanka", "Solar", "Green", "Sun", "Metro", "Delta", "Ocean"];
const OWNER_SUFFIXES = ["Power", "Energy", "Roofs", "Developers", "Renewables", "Holdings", "Estates"];


// helpers
const rand    = () => Math.random();
const randInt = (min, max) => Math.floor(min + rand() * (max - min + 1));
const pick    = (arr) => arr[Math.floor(rand() * arr.length)];

/** Fraction of peak output for a given time of day (0..1). */
function solarFactor(date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  const sunrise = 6, sunset = 18.5;
  if (hour <= sunrise || hour >= sunset) return 0;
  const span = sunset - sunrise;
  const x = (hour - sunrise) / span;               // 0..1
  const bell = Math.sin(Math.PI * x);
  return Math.max(0, Math.min(1, Math.pow(bell, 0.9)));
}

/** One reading for an installation at a moment in time.
 *  cumulative_kwh is the running total that carries forward day to day. */
function readingValue(capacityKw, date, cloudFactor, cumulativeKwh) {
  const f = solarFactor(date);
  if (f <= 0) {
    return { power: 0, energy: cumulativeKwh, voltage: 0 };
  }
  const noise    = 0.92 + rand() * 0.16;
  const power    = capacityKw * f * cloudFactor * noise;
  const energy   = cumulativeKwh + power * (INTERVAL_MINUTES / 60);  // cumulative
  const voltage  = 228 + rand() * 8 - 4;
  return { power, energy, voltage };
}

const ownerName = () => `${pick(OWNER_PREFIXES)} ${pick(OWNER_SUFFIXES)}`;

// -------------------------------------------------------------- seeding

async function truncate(client) {
  await client.query(`
    TRUNCATE generation_readings, solar_installations, grid_substations,
             users, districts, provinces
    RESTART IDENTITY CASCADE
  `);
}

async function insertProvinces(client) {
  const ids = [];
  for (const name of PROVINCES) {
    const { rows } = await client.query(
      "INSERT INTO provinces (name) VALUES ($1) RETURNING id", [name]
    );
    ids.push(rows[0].id);
  }
  return ids;
}

async function insertDistricts(client, provinceIds) {
  const ids = [];
  for (const [name, provinceIdx] of DISTRICTS) {
    const { rows } = await client.query(
      "INSERT INTO districts (province_id, name) VALUES ($1, $2) RETURNING id",
      [provinceIds[provinceIdx], name]
    );
    ids.push(rows[0].id);
  }
  return ids;
}

async function insertSubstations(client, districtIds) {
  const ids = [];
  for (const districtId of districtIds) {
    const name = `Grid Substation - District ${districtId}`;
    const { rows } = await client.query(
      "INSERT INTO grid_substations (district_id, name) VALUES ($1, $2) RETURNING id",
      [districtId, name]
    );
    ids.push(rows[0].id);
  }
  return ids;
}

async function insertInstallations(client, substationIds) {
  const rows = [];
  let seq = 0;
  for (const substationId of substationIds) {
    for (let i = 0; i < INSTALLATIONS_PER_SUBSTATION; i++) {
      seq += 1;
      const meterId    = `MTR-${String(seq).padStart(5, "0")}`;
      const inverterId = `INV-${String(seq).padStart(5, "0")}`;
      const capacityKw = randInt(30, 500) + Math.round(rand() * 100) / 100;
      const daysAgo    = randInt(180, 1825);
      const installedAt = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);

      const { rows: inserted } = await client.query(
        `INSERT INTO solar_installations
           (substation_id, meter_id, inverter_id, owner_name, capacity_kw, installed_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, capacity_kw`,
        [substationId, meterId, inverterId, ownerName(), capacityKw, installedAt]
      );
      rows.push({ id: inserted[0].id, capacity_kw: Number(inserted[0].capacity_kw) });
    }
  }
  return rows;
}

async function insertReadings(client, installations) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (DAYS_OF_READINGS - 1));

  const BATCH = 2000;
  let values = [];
  let params = [];
  let n = 0;
  let total = 0;

  const flush = async () => {
    if (!values.length) return;
    const sql = `
      INSERT INTO generation_readings
        (installation_id, recorded_at, power_kw, energy_kwh, voltage)
      VALUES ${values.join(", ")}
      ON CONFLICT (installation_id, recorded_at) DO NOTHING
    `;
    await client.query(sql, params);
    total += values.length;
    values = [];
    params = [];
    n = 0;
  };

  for (const inst of installations) {
    const cloudBase = 0.55 + rand() * 0.4;
    let cumulativeKwh = 0;

    for (let d = 0; d < DAYS_OF_READINGS; d++) {
      const dayCloud = cloudBase * (0.8 + rand() * 0.35);
      for (let r = 0; r < READINGS_PER_DAY; r++) {
        const when = new Date(
          start.getTime() + (d * 24 * 60 + r * INTERVAL_MINUTES) * 60000
        );
        const { power, energy, voltage } =
          readingValue(inst.capacity_kw, when, dayCloud, cumulativeKwh);
        cumulativeKwh = energy;                    // carry forward

        values.push(`($${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5})`);
        params.push(inst.id, when, power.toFixed(3), energy.toFixed(3), voltage.toFixed(2));
        n += 5;

        if (values.length >= BATCH) await flush();
      }
    }
  }
  await flush();
  return total;
}

async function insertUsers(client) {
  const passwordHash = await bcrypt.hash("Password123!", 10);

  const { rows: prov } = await client.query(
    "SELECT id FROM provinces WHERE name = 'Western'"
  );
  const { rows: dist } = await client.query(
    "SELECT id FROM districts WHERE name = 'Colombo'"
  );

  const users = [
    ["national.admin",  passwordHash, "national",   null,       null],
    ["western.admin",   passwordHash, "provincial", prov[0].id, null],
    ["colombo.admin",   passwordHash, "district",   prov[0].id, dist[0].id],
  ];

  for (const u of users) {
    await client.query(
      `INSERT INTO users (username, password_hash, role, province_id, district_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (username) DO NOTHING`,
      u
    );
  }
  return users.map((u) => `${u[0]} (${u[2]}) / Password123!`);
}



// main
async function main() {
  const reset = process.argv.includes("--reset");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (reset) {
      console.log("Resetting tables...");
      await truncate(client);
    }

    const { rows: existing } = await client.query(
      "SELECT COUNT(*)::int AS c FROM provinces"
    );
    if (existing[0].c > 0 && !reset) {
      throw new Error(
        "Database already contains data. Re-run with --reset to wipe and reseed."
      );
    }

    console.log(`Seeding ${PROVINCES.length} provinces...`);
    const provinceIds = await insertProvinces(client);

    console.log(`Seeding ${DISTRICTS.length} districts...`);
    const districtIds = await insertDistricts(client, provinceIds);

    console.log(`Seeding ${districtIds.length} grid substations...`);
    const substationIds = await insertSubstations(client, districtIds);

    const installCount = substationIds.length * INSTALLATIONS_PER_SUBSTATION;
    console.log(`Seeding ${installCount} solar installations...`);
    const installations = await insertInstallations(client, substationIds);

    console.log(
      `Seeding ~${TOTAL_READINGS.toLocaleString()} generation readings ` +
      `(${DAYS_OF_READINGS} days × ${READINGS_PER_DAY}/day × ${installCount} installations)...`
    );
    const readings = await insertReadings(client, installations);

    console.log("Seeding users...");
    const creds = await insertUsers(client);

    await client.query("COMMIT");

    console.log("\nSeed complete.");
    console.log(`  provinces            : ${provinceIds.length}`);
    console.log(`  districts            : ${districtIds.length}`);
    console.log(`  grid_substations     : ${substationIds.length}`);
    console.log(`  solar_installations  : ${installations.length}`);
    console.log(`  generation_readings  : ${readings}`);
    console.log("  users:");
    creds.forEach((c) => console.log(`    - ${c}`));
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\nSeed failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();