"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const promises_1 = __importDefault(require("fs/promises"));
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
            const fileContent = await file_system_utils_1.FileSystemUtils.readJsonFile(userInfoPath);
            // Check if it's the new authenticated format with user object
            if (this.isStoredUserInfo(fileContent)) {
                // Load machine info to get the anonymous user ID
                const machineInfo = await this.machineService.loadMachineInfo();
                // Convert StoredUserInfo to internal UserInfo format
                this.userInfo = {
                    anonymousId: `anon-${machineInfo.machineId}`,
                    clientMachineId: machineInfo.machineId,
                    auth: {
                        userId: fileContent.user.id,
                        email: fileContent.user.email,
                        username: fileContent.user.username,
                        apiToken: fileContent.api_key
                    }
                };
            }
            else {
                // Anonymous user format (internal UserInfo stored directly)
                this.userInfo = fileContent;
            }
        }
        catch (error) {
            // Generate default user info if file doesn't exist
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
            anonymousId: `anon-${machineId}`,
            clientMachineId: machineId
        };
    }
    async ensureUserExists() {
        if (!this.userInfo)
            return;
        // Get the effective user ID (real user ID if authenticated, otherwise anonymous ID)
        const effectiveUserId = this.userInfo.auth?.userId || this.userInfo.anonymousId;
        const userEmail = this.userInfo.auth?.email;
        // Skip if we don't have a valid user ID
        if (!effectiveUserId) {
            throw new Error('Invalid user state: no user ID available');
        }
        // Create or update user
        await database_1.prisma.user.upsert({
            where: { id: effectiveUserId },
            create: {
                id: effectiveUserId,
                email: userEmail,
            },
            update: {
                email: userEmail
            }
        });
        // Create or update machine
        await database_1.prisma.machine.upsert({
            where: { id: this.userInfo.clientMachineId },
            create: {
                id: this.userInfo.clientMachineId,
                userId: effectiveUserId,
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
        const userInfo = this.getUserInfo();
        // Return real user ID if authenticated, otherwise anonymous ID
        return userInfo.auth?.userId || userInfo.anonymousId;
    }
    getClientMachineId() {
        return this.getUserInfo().clientMachineId;
    }
    isAuthenticated() {
        return !!this.userInfo?.auth;
    }
    getAuthenticatedUserId() {
        return this.userInfo?.auth?.userId || null;
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
        // Update in-memory auth info
        this.userInfo.auth = {
            userId: realUserId,
            email: email,
            username: username || email.split('@')[0],
            apiToken: apiKey
        };
        // Save complete user info to file in StoredUserInfo format
        const userInfoPath = this.getUserInfoPath();
        const storedUserInfo = {
            user: {
                id: realUserId,
                email: email,
                username: username || email.split('@')[0]
            },
            api_key: apiKey
        };
        await file_system_utils_1.FileSystemUtils.writeJsonFile(userInfoPath, storedUserInfo);
    }
    async logout() {
        if (!this.userInfo) {
            throw new Error('User info not loaded');
        }
        // Remove auth info
        delete this.userInfo.auth;
        // Delete the user info file to ensure clean logout
        const userInfoPath = this.getUserInfoPath();
        try {
            await promises_1.default.unlink(userInfoPath);
        }
        catch (error) {
            // Ignore error if file doesn't exist
        }
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
    // Type guard for StoredUserInfo
    isStoredUserInfo(obj) {
        return obj &&
            typeof obj === 'object' &&
            obj.user &&
            typeof obj.user === 'object' &&
            typeof obj.user.id === 'string' &&
            typeof obj.user.email === 'string' &&
            typeof obj.user.username === 'string' &&
            typeof obj.api_key === 'string';
    }
}
exports.UserService = UserService;
//# sourceMappingURL=user.service.js.map