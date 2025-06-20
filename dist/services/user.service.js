"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const database_1 = require("../database");
const config_1 = require("../config");
const machine_service_1 = require("./machine.service");
const path_utils_1 = require("../utils/path-utils");
const file_system_utils_1 = require("../utils/file-system-utils");
class UserService {
    userInfo = null;
    machineService;
    constructor() {
        this.machineService = new machine_service_1.MachineService();
    }
    async loadUserInfo() {
        const userInfoPath = this.getUserInfoPath();
        try {
            const parsed = await file_system_utils_1.FileSystemUtils.readJsonFile(userInfoPath);
            // Check if it's the new format from the spec
            if ('username' in parsed && 'api_key' in parsed) {
                // Load machine info to get the anonymous user ID
                const machineInfo = await this.machineService.loadMachineInfo();
                // Convert new format to our internal format
                this.userInfo = {
                    userId: `anon-${machineInfo.machineId}`,
                    clientMachineId: machineInfo.machineId,
                    auth: {
                        realUserId: parsed.username, // Using username as user ID for now
                        email: `${parsed.username}@roiai.com`, // Generate email from username
                        apiToken: parsed.api_key
                    }
                };
            }
            else {
                // Old format
                this.userInfo = parsed;
            }
        }
        catch (error) {
            // Silently generate default user info if file doesn't exist
            this.userInfo = await this.generateDefaultUserInfo();
        }
        // Ensure user exists in database
        await this.ensureUserExists();
        return this.userInfo;
    }
    async generateDefaultUserInfo() {
        // Load machine info (will generate if doesn't exist)
        const machineInfo = await this.machineService.loadMachineInfo();
        const machineId = machineInfo.machineId;
        return {
            userId: `anon-${machineId}`,
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
    isAuthenticated() {
        return !!this.userInfo?.auth;
    }
    getAuthenticatedUserId() {
        return this.userInfo?.auth?.realUserId || null;
    }
    getAuthenticatedEmail() {
        return this.userInfo?.auth?.email || null;
    }
    getApiToken() {
        return this.userInfo?.auth?.apiToken || null;
    }
    async login(realUserId, email, apiKey, username) {
        if (!this.userInfo) {
            throw new Error('User info not loaded');
        }
        // Update in-memory auth info for backward compatibility
        this.userInfo.auth = {
            realUserId,
            email,
            apiToken: apiKey
        };
        // Save in the new format according to spec
        const userInfoPath = this.getUserInfoPath();
        // Save user info in new format
        const newFormat = {
            username: username || email.split('@')[0],
            api_key: apiKey
        };
        await file_system_utils_1.FileSystemUtils.writeJsonFile(userInfoPath, newFormat);
    }
    async logout() {
        if (!this.userInfo) {
            throw new Error('User info not loaded');
        }
        // Remove auth info
        delete this.userInfo.auth;
        // Save updated user info
        const userInfoPath = this.getUserInfoPath();
        await file_system_utils_1.FileSystemUtils.writeJsonFile(userInfoPath, this.userInfo);
    }
    getUserInfoPath() {
        const config = config_1.configManager.get().user;
        // Check if we have a full path (for testing or custom configs)
        if (config?.infoPath) {
            return path_utils_1.PathUtils.resolvePath(config.infoPath);
        }
        // Otherwise use filename in app directory
        const filename = config?.infoFilename || 'user_info.json';
        return path_1.default.join(machine_service_1.MachineService.getAppDirectory(), filename);
    }
}
exports.UserService = UserService;
//# sourceMappingURL=user.service.js.map