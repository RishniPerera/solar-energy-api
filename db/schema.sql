DROP TABLE IF EXISTS generation_readings CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS solar_installations CASCADE;
DROP TABLE IF EXISTS grid_substations CASCADE;
DROP TABLE IF EXISTS districts CASCADE;
DROP TABLE IF EXISTS provinces CASCADE;

CREATE TABLE provinces (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE districts (
  id SERIAL PRIMARY KEY,
  province_id INT NOT NULL REFERENCES provinces(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  UNIQUE (province_id, name)
);


-- Grid Substation — the grid node installations connect to.
CREATE TABLE grid_substations (
  id SERIAL PRIMARY KEY,
  district_id INT NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  UNIQUE (district_id, name)
);

-- Solar Installation — the metered asset (write client)
--    meter_id / inverter_id are ATTRIBUTES of the installation,not a separate Device entity.
CREATE TABLE solar_installations (
  id SERIAL PRIMARY KEY,
  substation_id INT NOT NULL REFERENCES grid_substations(id) ON DELETE CASCADE,
  meter_id VARCHAR(50) NOT NULL UNIQUE,     -- attribute of installation, NOT a device entity
  inverter_id VARCHAR(50),
  owner_name VARCHAR(100),
  capacity_kw NUMERIC(6,2) NOT NULL,
  installed_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

--  Generation Reading — append-only time series
--    Modelled as its own table, NOT last-value fields on the installation.
--    UNIQUE (installation_id, recorded_at) gives idempotency on writes.
CREATE TABLE generation_readings (
  id BIGSERIAL PRIMARY KEY,
  installation_id INT NOT NULL REFERENCES solar_installations(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL,
  power_kw NUMERIC(8,3) NOT NULL,
  energy_kwh NUMERIC(12,3) NOT NULL,
  voltage NUMERIC(6,2) NOT NULL,
  UNIQUE (installation_id, recorded_at)      -- idempotency guard on time
);

-- Index for the analytical read path (paginated history per installation)
CREATE INDEX idx_readings_installation_time
  ON generation_readings (installation_id, recorded_at DESC);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('national','provincial','district')),
  province_id INT REFERENCES provinces(id),
  district_id INT REFERENCES districts(id)
);
