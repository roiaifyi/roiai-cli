"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../database");
const config_1 = require("../config");
class UserService {
    userInfo = null;
    async loadUserInfo() {
        // Get user info path from config
        const configPath = config_1.configManager.get().user?.infoPath || '~/.claude/user_info.json';
        const userInfoPath = configPath.startsWith('~')
            ? path_1.default.join(os_1.default.homedir(), configPath.slice(1))
            : path_1.default.resolve(configPath);
        try {
            const data = await promises_1.default.readFile(userInfoPath, 'utf-8');
            this.userInfo = JSON.parse(data);
        }
        catch (error) {
            console.warn(`User info file not found at ${userInfoPath}, generating default values`);
            this.userInfo = this.generateDefaultUserInfo();
        }
        // Ensure user exists in database
        await this.ensureUserExists();
        return this.userInfo;
    }
    generateDefaultUserInfo() {
        // Generate a machine ID based on hostname and platform
        const machineId = crypto_1.default
            .createHash('sha256')
            .update(`${os_1.default.hostname()}:${os_1.default.platform()}:${os_1.default.arch()}`)
            .digest('hex')
            .substring(0, 16);
        return {
            userId: 'anonymous',
            clientMachineId: machineId,
            email: undefined
        };
    }
    async ensureUserExists() {
        if (!this.userInfo)
            return;
        // Create or update user
        await database_1.prisma.user.upsert({
            where: { id: this.userInfo.userId },
            create: {
                id: this.userInfo.userId,
                email: this.userInfo.email,
            },
            update: {
                lastSeen: new Date(),
                email: this.userInfo.email
            }
        });
        // Create or update machine
        await database_1.prisma.machine.upsert({
            where: { id: this.userInfo.clientMachineId },
            create: {
                id: this.userInfo.clientMachineId,
                userId: this.userInfo.userId,
                machineName: os_1.default.hostname(),
                osInfo: `${os_1.default.platform()} ${os_1.default.release()}`
            },
            update: {
                lastSeen: new Date(),
                machineName: os_1.default.hostname(),
                osInfo: `${os_1.default.platform()} ${os_1.default.release()}`
            }
        });
    }
    getUserInfo() {
        if (!this.userInfo) {
            throw new Error('User info not loaded');
        }
        return this.userInfo;
    }
    getUserId() {
        return this.getUserInfo().userId;
    }
    getClientMachineId() {
        return this.getUserInfo().clientMachineId;
    }
}
exports.UserService = UserService;
//# sourceMappingURL=user.service.js.map