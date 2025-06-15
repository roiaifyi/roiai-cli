"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.LogLevel = void 0;
const chalk_1 = __importDefault(require("chalk"));
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    level = LogLevel.INFO;
    setLevel(level) {
        this.level = level;
    }
    debug(...args) {
        if (this.level <= LogLevel.DEBUG) {
            console.log(chalk_1.default.gray('[DEBUG]'), ...args);
        }
    }
    info(...args) {
        if (this.level <= LogLevel.INFO) {
            console.log(chalk_1.default.blue('[INFO]'), ...args);
        }
    }
    warn(...args) {
        if (this.level <= LogLevel.WARN) {
            console.warn(chalk_1.default.yellow('[WARN]'), ...args);
        }
    }
    error(...args) {
        if (this.level <= LogLevel.ERROR) {
            console.error(chalk_1.default.red('[ERROR]'), ...args);
        }
    }
    success(...args) {
        console.log(chalk_1.default.green('✓'), ...args);
    }
    fail(...args) {
        console.log(chalk_1.default.red('✗'), ...args);
    }
}
exports.logger = new Logger();
//# sourceMappingURL=logger.js.map