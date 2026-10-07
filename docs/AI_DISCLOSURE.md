# AI Disclosure Diary
This records every prompt that produced code, a design decision and fixes. 
Tools used: DeepSeek V4.1


Entry 1 — 2026-09-20
Area: app.js file
Prompt: fix the bug in this code by modify the code to returning my Express app. It returns undefined (an empty object)
Output received: Full fixed app.js file with modified line- 
The bug
src/app.js has module.exports = app; — that's right. But look closely at the raw bytes returned by grep:
 module.exports = app;

 What I did with it:Changed the app.js file by adding the new line and run the file again to confirm the Express app is running. 
 How I verified: run the app.js file and got the output - 
 curl http://localhost:3000
                                                                                
StatusCode        : 200                                                          
StatusDescription : OK                                                           
Content           : {"message":"Solar Energy API is running"}     


Entry 2— 2026-09-26
Tool: DeepSeek (AI assistant)
Area:App setup / main server file
Prompt:> " generate app.js file for my Express API. It should set up Express, use JSON middleware, connect to my PostgreSQL database, and load all my route files. Add a 404 handler and a global error handler. Use dotenv for environment variables. If I have a swagger file, serve the Swagger UI too. Keep it clean and simple. No frontend stuff."


Output received:A basic `app.js` with Express setup, middleware, route loading, and error handlers.
What I did with it:Kept the structure. Changed the database connection to use my `db.js` file. Added `helmet` and `cors` manually. Fixed the error handler to match my `ApiError` class.
How I verified: Ran `node app.js` and checked that the server starts, routes load, and a bad URL returns my error JSON.



Entry 3 — 2026-09-26
Tool:DeepSeek (AI assistant)
Area: Database schema
Prompt:
"provide a SQL schema for my PostgreSQL database. Create a file db/schema.sql with the following tables: provinces, districts, grid_substations, solar_installations, generation_readings, and users. Make sure to add DROP TABLE IF EXISTS ... CASCADE; at the top for all tables in the right order. For relationships: provinces → districts (one‑to‑many), districts → grid_substations, grid_substations → solar_installations, solar_installations → generation_readings. In solar_installations, store meter_id and inverter_id as normal columns, not as a separate device table. generation_readings should be an append‑only time series. Use BIGSERIAL for its id. Add a unique constraint on (installation_id, recorded_at) and an index on (installation_id, recorded_at DESC). For users, add a role check constraint (national, provincial, district) and optional province_id and district_id foreign keys. Use SERIAL for most primary keys, except generation_readings which uses BIGSERIAL. Keep it clean and simple."


Output received:Full `db/schema.sql` with all tables, constraints, and indexes.
What I did with it: Accepted the structure. Changed the `users` table to add `created_at` timestamp. Verified the foreign key cascades were correct. Added a comment explaining why `meter_id` is an attribute.
How I verified:Ran the script in psql. Checked tables with `\dt`. Checked foreign keys with `\d+ generation_readings`. Inserted a test row and confirmed the unique constraint works.



Entry 4 — 2026-09-26
Tool:DeepSeek (AI assistant)
Area:Seed data generation
Prompt:
"generte a seed data script for my PostgreSQL database. Write a script (SQL or Node.js, whichever is simpler) that inserts: 9 provinces, 25 districts (linked to provinces), 20+ grid substations (linked to districts), 200+ solar installations (linked to substations, with meter_id, inverter_id, owner_name, capacity_kw, installed_at), 1 week of generation readings per installation, one every 15 minutes. The readings should have a realistic daily pattern: near zero at night, rising during the day, peaking around noon, falling in the evening. Also add a few users: one national, one provincial, one district. Make sure foreign keys are consistent and insertion order is correct. Use plain SQL inserts or a simple Node script with pg. Keep it simple and runnable."

Output received:A Node.js script using `pg` and simple loops to generate the data, or a large SQL file with inserts.
What I did with it: Kept the generation logic. Changed the number of installations to 220. Adjusted the diurnal shape to use a sine wave. Added a check to avoid duplicate timestamps. Ensured the users table had the correct role values.
How I verified: Ran the script on my local database. Checked row counts with `SELECT COUNT(*) FROM ...`. Ran a few sample queries to confirm foreign keys and that readings have a realistic pattern. Then ran the same script on my deployed database.


Entry 5 — 2026-09-30
Tool:DeepSeek (AI assistant)
Area:Error handling utility
Prompt:
provide a util/errors.js file for my Express API. It should have an ApiError class that extends Error. The class should take a status code, a message, and an optional details object. Also add a helper function sendError(res, err) that sends a JSON response with { code, message, details } using the error’s status code. Make it simple and reusable across all routes. No external packages."

Output received:A basic ApiError class and a sendError function.
What I did with it: Kept the class. Added a `code` property (e.g., `'NOT_FOUND'`) so the error body is more specific. Changed `sendError` to use `res.status(err.status).json(...)`. Added a fallback for generic errors (500) if no status. Also exported both.
How I verified: Imported the file in a test route, threw an `ApiError(404, 'Not found')`, and checked the JSON response had the correct status and shape. Also tested an unknown error to confirm it returns 500 with a generic message.


Entry 6 — 2026-10-04
Area: Pagination helper / advanced behaviour
Prompt:
 generate a pagination helper file for my Express API. It should have two functions: one to parse page and limit from the query string, with defaults (page 1, limit 50, max 200), and return page, limit, offset. Another function to build pagination links: self, next, prev, total, page, limit, totalPages. The links should be full URLs using req.protocol, req.get('host'), req.baseUrl, req.path, and keep any existing query parameters. Use URLSearchParams for the query string. Export both functions. Keep it simple and reusable for any paginated collection."

Output received: A `util/pagination.js` file with `parsePagination` and `buildLinks` functions.
What I did with it: Kept the structure. Changed the max limit from 100 to 200 to match my seed scale. Added a comment explaining why `req.baseUrl` and `req.path` are used together. Verified that `next` and `prev` are `null` when out of range.
How I verified: Called `parsePagination` with different query strings and checked the offset. Called `buildLinks` with a mock `req` and confirmed the URLs kept existing filters and added `page` correctly. Tested with `page=1`, `page=last`, and `page=last+1`.



Entry 7— 2026-10-05
Tool: DeepSeek (AI assistant)
Area:Controller for hierarchy and installations
Prompt:
"generate a controller file for my Express API that handles the geographic hierarchy and installations. It should use my existing db pool, asyncHandler, and ApiError. Add functions for: list all provinces (id, name ordered by name), get one province by id (404 if not found), list districts of a province (check province exists first, then list id, name, province_id ordered by name), get one district by id (404 if not found), list substations of a district (check district exists, then list id, name, district_id ordered by name), get one substation by id (404 if not found), list installations of a substation (check substation exists, then list id, substation_id, meter_id, inverter_id, owner_name, capacity_kw, installed_at ordered by id). For list endpoints, return { data: rows, count: rows.length }. For single get, return { data: row }. Use asyncHandler to wrap each function and throw ApiError with status 404 and code 'NOT_FOUND' when something is missing. Keep it clean and consistent."

Output received:A controller file with all the requested functions, using `pool.query`, `asyncHandler`, and `ApiError`.
What I did with it: Kept the structure. Added a comment header for each section (Provinces, Districts, etc.). Verified that parent existence checks are done before listing children. Confirmed the SQL queries use parameterised values. Checked that the JSON shape matches my API contract.
How I verified: Mounted the routes in a test Express app and called each endpoint with valid and invalid IDs. Confirmed 200 with correct data, and 404 with the correct error body when the parent or resource doesn’t exist.




Entry 8 — 2026-10-06
Tool: DeepSeek (AI assistant)
Area:App wiring / main Express setup (Phase 11)
Prompt:
" I need to wire up my Express API in src/app.js for Phase 11. It should require express, cors, morgan, and dotenv. Load my route files: authRoutes, hierarchyRoutes, installationRoutes, districtRoutes. Import notFound and errorHandler from ./utils/errors. Create the app, use cors, morgan, and express.json with a 1mb limit. Add a root endpoint that returns a message and a link to /docs. Add a /health endpoint that returns status ok and a timestamp. Mount the routes: /auth for authRoutes, / for hierarchyRoutes, installationRoutes, and districtRoutes. Finally, use notFound and errorHandler, then export the app. Keep it clean and in order."

Output received: A complete `app.js` file with middleware, root/health endpoints, route mounting, and error handlers.
What I did with it: Kept the structure. Added comments for each section (Global middleware, Root + health, Routes, 404 + error handler). Confirmed the order of `notFound` and `errorHandler` is last. Checked that `express.json` has a 1mb limit as required. Ensured `module.exports = app` is at the end.
How I verified: Started the server with `node src/server.js` (after creating `server.js`). Hit `/`, `/health`, and a few endpoints to confirm they respond. Sent a bad request to check the 404 and error handlers return the correct JSON shape.



Entry 9 — 2026-10-06
Tool: DeepSeek (AI assistant)
Area: Server startup file (Phase 11)
Prompt:
" generate a simple src/server.js file to start my Express server. It should load dotenv, then require my app.js. Set the port from process.env.PORT or fall back to 3000. Call app.listen and log a message that the Solar Energy API is running on that port, and also log the environment (process.env.NODE_ENV or 'development'). Keep it short and clean."

Output received: A short `server.js` file that loads dotenv, requires app, and calls `app.listen`.
What I did with it: Kept it as is. Added a `console.log` line for the environment. Confirmed the port fallback is 3000.
How I verified: Ran `node src/server.js` and confirmed the server started and logged the correct port and environment. Hit a few endpoints to make sure it was serving.



Entry 10 — 2026-10-06
Tool: DeepSeek (AI assistant)
Area:Auth middleware bug fix — jurisdiction enforcement
Prompt:
" I found a bug in my src/middleware/auth.js file. The enforceJurisdiction function looks for req.params.installationId, but my atomic installation route uses :id instead. So when a Colombo user tries to access an installation in Hambantota, it doesn’t return 403 — it just returns the data. I need to fix it so the middleware accepts either req.params.installationId or req.params.id. Can you show me the exact line to change? Keep it simple."

Output received: The exact replacement lines: use `req.params.installationId ?? req.params.id` and parse it.
What I did with it: Replaced the old `const installationId = req.params.installationId ? ...` block with the suggested fix. Added a comment explaining why both param names are accepted. Saved the file.
How I verified:Restarted the server (nodemon). Re-ran the failing test: called `/installations/73` with a Colombo token. Confirmed it now returns 403 instead of the data. Also re-ran the previous successful tests to make sure nothing else broke.



Entry 11 — 2026-10-07
Tool: DeepSeek (AI assistant)
Area: OpenAPI / Swagger spec (Phase 12)
Prompt:
" I already have a src/swagger.js file. I need the OpenAPI 3.0.3 spec object to put inside it. Load dotenv, and set the server URL from process.env.PUBLIC_BASE_URL or fall back to http://localhost: plus process.env.PORT or 3000. Info: title 'SLSEA Solar Generation API', version 1.0.0, short description about real-time and historical solar data, write path device-only, read path jurisdiction-scoped. Tags: Auth, Hierarchy, Installations, Readings, Analytics. Security: bearer JWT via bearerAuth. Schemas: Error (with code, message, detail, timestamp, path), Province, District, Substation, Installation, Reading, Pagination. Use $ref where needed. Paths — cover all of these: POST /auth/token (device or password grant, security: []), GET /provinces, GET /provinces/{id}, GET /provinces/{id}/districts, GET /districts/{id}, GET /districts/{id}/grid-substations, GET /grid-substations/{id}, GET /grid-substations/{id}/installations, POST /installations, GET/PUT/PATCH/DELETE /installations/{id}, GET /installations/{id}/composite, GET /installations/{id}/last-reading, GET and POST /installations/{installationId}/readings (with query params: page, limit, from, to, sort), GET /installations/{installationId}/readings/{readingId}, GET /districts/{id}/generation-summary. Include the correct status codes and Location headers on creates. Use my Error schema for error responses. Keep the structure clean and consistent. Export the object with module.exports."

Output received: A full `swagger.js` with the OpenAPI object, all schemas, all paths, and `module.exports`.
What I did with it: Kept the overall structure. Added the `PUBLIC_BASE_URL` fallback so the deployed URL is picked up on Render. Checked that `/auth/token` has `security: []` so it's public. Confirmed the Error schema matches my actual error body. Verified that all path params are declared. Fixed the `oneOf` for the token request body so Swagger renders it correctly.
How I verified: Ran the server and opened `/docs`. Confirmed the Swagger UI loads, all tags show up, and the schemas render. Used Swagger's "Try it out" for a few GETs to confirm the URLs and params are right.




