"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ccCommand = void 0;
const commander_1 = require("commander");
const sync_command_1 = require("./sync.command");
const watch_command_1 = require("./watch.command");
const push_command_1 = require("./push.command");
exports.ccCommand = new commander_1.Command('cc')
    .description('Claude Code usage tracking commands')
    .addCommand(sync_command_1.syncCommand)
    .addCommand(watch_command_1.watchCommand)
    .addCommand(push_command_1.pushCommand);
//# sourceMappingURL=index.js.map