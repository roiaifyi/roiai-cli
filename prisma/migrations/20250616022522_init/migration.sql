-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "username" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "total_projects" INTEGER NOT NULL DEFAULT 0,
    "total_sessions" INTEGER NOT NULL DEFAULT 0,
    "total_messages" INTEGER NOT NULL DEFAULT 0,
    "total_cost" DECIMAL NOT NULL DEFAULT 0,
    "total_input_tokens" BIGINT NOT NULL DEFAULT 0,
    "total_output_tokens" BIGINT NOT NULL DEFAULT 0,
    "total_cache_creation_tokens" BIGINT NOT NULL DEFAULT 0,
    "total_cache_read_tokens" BIGINT NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "machines" (
    "client_machine_id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "machine_name" TEXT,
    "os_info" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "total_projects" INTEGER NOT NULL DEFAULT 0,
    "total_sessions" INTEGER NOT NULL DEFAULT 0,
    "total_messages" INTEGER NOT NULL DEFAULT 0,
    "total_cost" DECIMAL NOT NULL DEFAULT 0,
    "total_input_tokens" BIGINT NOT NULL DEFAULT 0,
    "total_output_tokens" BIGINT NOT NULL DEFAULT 0,
    "total_cache_creation_tokens" BIGINT NOT NULL DEFAULT 0,
    "total_cache_read_tokens" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "machines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "projects" (
    "project_id" TEXT NOT NULL PRIMARY KEY,
    "project_name" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_machine_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "total_sessions" INTEGER NOT NULL DEFAULT 0,
    "total_messages" INTEGER NOT NULL DEFAULT 0,
    "total_cost" DECIMAL NOT NULL DEFAULT 0,
    "total_input_tokens" BIGINT NOT NULL DEFAULT 0,
    "total_output_tokens" BIGINT NOT NULL DEFAULT 0,
    "total_cache_creation_tokens" BIGINT NOT NULL DEFAULT 0,
    "total_cache_read_tokens" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "projects_client_machine_id_fkey" FOREIGN KEY ("client_machine_id") REFERENCES "machines" ("client_machine_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sessions" (
    "session_id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_machine_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "total_messages" INTEGER NOT NULL DEFAULT 0,
    "total_cost" DECIMAL NOT NULL DEFAULT 0,
    "total_input_tokens" BIGINT NOT NULL DEFAULT 0,
    "total_output_tokens" BIGINT NOT NULL DEFAULT 0,
    "total_cache_creation_tokens" BIGINT NOT NULL DEFAULT 0,
    "total_cache_read_tokens" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("project_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sessions_client_machine_id_fkey" FOREIGN KEY ("client_machine_id") REFERENCES "machines" ("client_machine_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "messages" (
    "uuid" TEXT NOT NULL PRIMARY KEY,
    "message_id" TEXT NOT NULL,
    "request_id" TEXT,
    "session_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "timestamp" DATETIME,
    "role" TEXT NOT NULL,
    "model" TEXT,
    "type" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_creation_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "price_per_input_token" DECIMAL,
    "price_per_output_token" DECIMAL,
    "price_per_cache_write_token" DECIMAL,
    "price_per_cache_read_token" DECIMAL,
    "cache_duration_minutes" INTEGER,
    "message_cost" DECIMAL NOT NULL DEFAULT 0,
    CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("session_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("project_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "file_status" (
    "file_path" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT,
    "session_id" TEXT,
    "user_id" TEXT,
    "file_size" INTEGER,
    "last_modified" DATETIME,
    "last_processed_line" INTEGER NOT NULL DEFAULT 0,
    "last_processed_at" DATETIME,
    "checksum" TEXT,
    CONSTRAINT "file_status_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("project_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "file_status_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("session_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "file_status_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sync_status" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "local_timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_at" DATETIME,
    "sync_batch_id" TEXT,
    "sync_response" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_project_name_client_machine_id_key" ON "projects"("project_name", "client_machine_id");

-- CreateIndex
CREATE INDEX "messages_session_id_idx" ON "messages"("session_id");

-- CreateIndex
CREATE INDEX "messages_project_id_idx" ON "messages"("project_id");

-- CreateIndex
CREATE INDEX "messages_user_id_idx" ON "messages"("user_id");

-- CreateIndex
CREATE INDEX "messages_timestamp_idx" ON "messages"("timestamp");

-- CreateIndex
CREATE INDEX "messages_request_id_idx" ON "messages"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_session_id_message_id_uuid_key" ON "messages"("session_id", "message_id", "uuid");

-- CreateIndex
CREATE INDEX "sync_status_synced_at_idx" ON "sync_status"("synced_at");

-- CreateIndex
CREATE UNIQUE INDEX "sync_status_table_name_record_id_key" ON "sync_status"("table_name", "record_id");
