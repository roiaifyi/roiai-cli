-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message_id" TEXT NOT NULL,
    "request_id" TEXT,
    "session_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_machine_id" TEXT NOT NULL,
    "timestamp" DATETIME,
    "role" TEXT NOT NULL,
    "model" TEXT,
    "type" TEXT,
    "input_tokens" BIGINT NOT NULL DEFAULT 0,
    "output_tokens" BIGINT NOT NULL DEFAULT 0,
    "cache_creation_tokens" BIGINT NOT NULL DEFAULT 0,
    "cache_read_tokens" BIGINT NOT NULL DEFAULT 0,
    "price_per_input_token" DECIMAL,
    "price_per_output_token" DECIMAL,
    "price_per_cache_write_token" DECIMAL,
    "price_per_cache_read_token" DECIMAL,
    "cache_duration_minutes" INTEGER,
    "message_cost" DECIMAL NOT NULL DEFAULT 0,
    "is_human_input" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("session_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("project_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "messages_client_machine_id_fkey" FOREIGN KEY ("client_machine_id") REFERENCES "machines" ("client_machine_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_messages" ("cache_creation_tokens", "cache_duration_minutes", "cache_read_tokens", "client_machine_id", "id", "input_tokens", "message_cost", "message_id", "model", "output_tokens", "price_per_cache_read_token", "price_per_cache_write_token", "price_per_input_token", "price_per_output_token", "project_id", "request_id", "role", "session_id", "timestamp", "type", "user_id") SELECT "cache_creation_tokens", "cache_duration_minutes", "cache_read_tokens", "client_machine_id", "id", "input_tokens", "message_cost", "message_id", "model", "output_tokens", "price_per_cache_read_token", "price_per_cache_write_token", "price_per_input_token", "price_per_output_token", "project_id", "request_id", "role", "session_id", "timestamp", "type", "user_id" FROM "messages";
DROP TABLE "messages";
ALTER TABLE "new_messages" RENAME TO "messages";
CREATE UNIQUE INDEX "messages_message_id_key" ON "messages"("message_id");
CREATE INDEX "messages_session_id_idx" ON "messages"("session_id");
CREATE INDEX "messages_project_id_idx" ON "messages"("project_id");
CREATE INDEX "messages_user_id_idx" ON "messages"("user_id");
CREATE INDEX "messages_client_machine_id_idx" ON "messages"("client_machine_id");
CREATE INDEX "messages_timestamp_idx" ON "messages"("timestamp");
CREATE INDEX "messages_request_id_idx" ON "messages"("request_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
