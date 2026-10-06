require("dotenv").config();

const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

module.exports = {
  openapi: "3.0.3",
  info: {
    title: "SLSEA Solar Generation API",
    version: "1.0.0",
    description:
      "Real-time and historical solar power generation data API for the " +
      "Sri Lanka Sustainable Energy Authority. Write path is device-only; " +
      "read path is jurisdiction-scoped.",
    contact: { name: "SLSEA API Team" },
  },
  servers: [
    { url: PUBLIC_BASE_URL, description: "Current deployment" },
  ],
  tags: [
    { name: "Auth",         description: "Issue JWTs for devices and users" },
    { name: "Hierarchy",    description: "Provinces, districts, grid substations" },
    { name: "Installations",description: "Solar installations (read + write)" },
    { name: "Readings",     description: "Generation readings history" },
    { name: "Analytics",    description: "Derived and processing resources" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code:      { type: "string", example: "NOT_FOUND" },
              message:   { type: "string", example: "Installation not found" },
              detail:    { type: "object", nullable: true },
              timestamp: { type: "string", format: "date-time" },
              path:      { type: "string", example: "/installations/999" },
            },
          },
        },
      },
      Province: {
        type: "object",
        properties: {
          id:   { type: "integer", example: 1 },
          name: { type: "string",  example: "Western" },
        },
      },
      District: {
        type: "object",
        properties: {
          id:          { type: "integer", example: 1 },
          name:        { type: "string",  example: "Colombo" },
          province_id: { type: "integer", example: 1 },
        },
      },
      Substation: {
        type: "object",
        properties: {
          id:          { type: "integer", example: 1 },
          name:        { type: "string",  example: "Grid Substation - District 1" },
          district_id: { type: "integer", example: 1 },
        },
      },
      Installation: {
        type: "object",
        properties: {
          id:            { type: "integer", example: 1 },
          substation_id: { type: "integer", example: 1 },
          meter_id:      { type: "string",  example: "MTR-00001" },
          inverter_id:   { type: "string",  example: "INV-00001" },
          owner_name:    { type: "string",  example: "Lanka Developers" },
          capacity_kw:   { type: "number",  example: 406.30 },
          installed_at:  { type: "string",  format: "date-time" },
        },
      },
      Reading: {
        type: "object",
        properties: {
          id:              { type: "integer", example: 1 },
          installation_id: { type: "integer", example: 1 },
          recorded_at:     { type: "string", format: "date-time" },
          power_kw:        { type: "number", example: 3.5 },
          energy_kwh:      { type: "number", example: 42.0 },
          voltage:         { type: "number", example: 230.5 },
        },
      },
      Pagination: {
        type: "object",
        properties: {
          self:       { type: "string" },
          next:       { type: "string", nullable: true },
          prev:       { type: "string", nullable: true },
          total:      { type: "integer" },
          page:       { type: "integer" },
          limit:      { type: "integer" },
          totalPages: { type: "integer" },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/auth/token": {
      post: {
        tags: ["Auth"],
        summary: "Issue a JWT (device or user)",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  {
                    type: "object",
                    required: ["grant_type", "meter_id"],
                    properties: {
                      grant_type: { type: "string", enum: ["device"] },
                      meter_id:   { type: "string", example: "MTR-00001" },
                    },
                  },
                  {
                    type: "object",
                    required: ["grant_type", "username", "password"],
                    properties: {
                      grant_type: { type: "string", enum: ["password"] },
                      username:   { type: "string", example: "national.admin" },
                      password:   { type: "string", example: "Password123!" },
                    },
                  },
                ],
              },
            },
          },
        },
        responses: {
          "200": { description: "Token issued" },
          "400": { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Invalid credentials", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/provinces": {
      get: {
        tags: ["Hierarchy"],
        summary: "List all provinces",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data:  { type: "array", items: { $ref: "#/components/schemas/Province" } },
                    count: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/provinces/{id}": {
      get: {
        tags: ["Hierarchy"],
        summary: "Retrieve one province",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "OK" },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/provinces/{id}/districts": {
      get: {
        tags: ["Hierarchy"],
        summary: "List districts in a province",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/districts/{id}": {
      get: {
        tags: ["Hierarchy"],
        summary: "Retrieve one district",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/districts/{id}/grid-substations": {
      get: {
        tags: ["Hierarchy"],
        summary: "List grid substations in a district",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/grid-substations/{id}": {
      get: {
        tags: ["Hierarchy"],
        summary: "Retrieve one grid substation",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/grid-substations/{id}/installations": {
      get: {
        tags: ["Hierarchy"],
        summary: "List installations connected to a substation",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/installations": {
      post: {
        tags: ["Installations"],
        summary: "Create a new installation",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Installation" } } },
        },
        responses: {
          "201": { description: "Created", headers: { Location: { schema: { type: "string" } } } },
          "400": { description: "Validation error" },
          "409": { description: "Duplicate meter_id" },
        },
      },
    },
    "/installations/{id}": {
      get: {
        tags: ["Installations"],
        summary: "Retrieve one installation",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "OK" }, "403": { description: "Forbidden" }, "404": { description: "Not found" } },
      },
      put: {
        tags: ["Installations"],
        summary: "Replace an installation (full representation)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Installation" } } },
        },
        responses: { "200": { description: "OK" }, "400": { description: "Missing fields" }, "404": { description: "Not found" } },
      },
      patch: {
        tags: ["Installations"],
        summary: "Partially update an installation",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Installation" } } },
        },
        responses: { "200": { description: "OK" }, "400": { description: "No fields" }, "404": { description: "Not found" } },
      },
      delete: {
        tags: ["Installations"],
        summary: "Delete an installation",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "204": { description: "Deleted" }, "404": { description: "Not found" } },
      },
    },
    "/installations/{id}/composite": {
      get: {
        tags: ["Installations"],
        summary: "Installation composite (installation + context + last reading + recent readings)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/installations/{id}/last-reading": {
      get: {
        tags: ["Analytics"],
        summary: "Last known reading for an installation (operational view)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "OK" }, "404": { description: "No readings" } },
      },
    },
    "/installations/{installationId}/readings": {
      get: {
        tags: ["Readings"],
        summary: "Readings history (paginated, filtered, sorted, conditional GET)",
        parameters: [
          { name: "installationId", in: "path",   required: true, schema: { type: "integer" } },
          { name: "page",           in: "query",  schema: { type: "integer", default: 1 } },
          { name: "limit",          in: "query",  schema: { type: "integer", default: 50, maximum: 200 } },
          { name: "from",           in: "query",  schema: { type: "string", format: "date-time" } },
          { name: "to",             in: "query",  schema: { type: "string", format: "date-time" } },
          { name: "sort",           in: "query",  schema: { type: "string", enum: ["recorded_at", "-recorded_at"] } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data:       { type: "array", items: { $ref: "#/components/schemas/Reading" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          "304": { description: "Not modified" },
        },
      },
      post: {
        tags: ["Readings"],
        summary: "Ingest a new reading (device only, scoped to own installation)",
        parameters: [{ name: "installationId", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["recorded_at", "power_kw", "energy_kwh", "voltage"],
                properties: {
                  recorded_at: { type: "string", format: "date-time" },
                  power_kw:    { type: "number" },
                  energy_kwh:  { type: "number" },
                  voltage:     { type: "number" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Created", headers: { Location: { schema: { type: "string" } } } },
          "400": { description: "Validation error" },
          "403": { description: "Not your installation" },
          "406": { description: "Not Acceptable" },
          "409": { description: "Duplicate reading" },
        },
      },
    },
    "/installations/{installationId}/readings/{readingId}": {
      get: {
        tags: ["Readings"],
        summary: "Retrieve a single reading",
        parameters: [
          { name: "installationId", in: "path", required: true, schema: { type: "integer" } },
          { name: "readingId",      in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/districts/{id}/generation-summary": {
      get: {
        tags: ["Analytics"],
        summary: "Aggregate generation for a district (processing resource)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "OK" }, "404": { description: "District not found" } },
      },
    },
  },
};