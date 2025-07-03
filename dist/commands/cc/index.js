"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ccCommand = void 0;
const commander_1 = require("commander");
const sync_command_1 = require("./sync.command");
const push_command_1 = require("./push.command");
const push_status_command_1 = require("./push-status.command");
const login_command_1 = require("./login.command");
const logout_command_1 = require("./logout.command");
exports.ccCommand = new commander_1.Command('cc')
    .description('Claude Code usage tracking commands')
    .option('--api-url <url>', 'Override API server URL')
    .addCommand(sync_command_1.syncCommand)
    .addCommand(push_command_1.pushCommand)
    .addCommand(push_status_command_1.pushStatusCommand)
    .addCommand((0, login_command_1.createLoginCommand)())
    .addCommand((0, logout_command_1.createLogoutCommand)());
//# sourceMappingURL=index.js.map