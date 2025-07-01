"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncCommand = void 0;
const commander_1 = require("commander");
const database_1 = require("../../database");
const user_service_1 = require("../../services/user.service");
const sync_service_1 = require("../../services/sync.service");
const error_handler_1 = require("../../utils/error-handler");
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
        error_handler_1.ErrorHandler.handleAsyncError(error, 'Sync');
    }
    finally {
        await database_1.db.disconnect();
    }
});
//# sourceMappingURL=sync.command.js.map