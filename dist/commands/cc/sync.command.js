"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncCommand = void 0;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const database_1 = require("../../database");
const user_service_1 = require("../../services/user.service");
const sync_service_1 = require("../../services/sync.service");
exports.syncCommand = new commander_1.Command('sync')
    .description('Sync Claude Code raw data to local database')
    .option('-f, --force', 'Force full resync (clear existing data)')
    .option('-p, --path <path>', 'Override raw data path')
    .action(async (options) => {
    try {
        const userService = new user_service_1.UserService();
        const syncService = new sync_service_1.SyncService(database_1.prisma, userService);
        await syncService.sync({
            force: options.force,
            path: options.path,
            quiet: false
        });
    }
    catch (error) {
        console.error(chalk_1.default.red(`\n✖ Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
    }
    finally {
        await database_1.db.disconnect();
    }
});
//# sourceMappingURL=sync.command.js.map