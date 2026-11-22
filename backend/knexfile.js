// Lets the stock `npx knex …` CLI (e.g. `knex migrate:make`) use the same configuration as the app.
import { loadEnv } from "./src/config/env.js";
import { knexConfig } from "./src/db/index.js";

export default knexConfig(loadEnv());
