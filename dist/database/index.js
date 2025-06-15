"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = exports.db = void 0;
const client_1 = require("@prisma/client");
const config_1 = require("../config");
const path_1 = __importDefault(require("path"));
class Database {
    prisma;
    static instance;
    constructor() {
        const dbPath = config_1.configManager.getDatabaseConfig().path;
        const absolutePath = path_1.default.isAbsolute(dbPath)
            ? dbPath
            : path_1.default.resolve(process.cwd(), dbPath);
        this.prisma = new client_1.PrismaClient({
            datasources: {
                db: {
                    url: `file:${absolutePath}`
                }
            },
            log: ['error', 'warn']
        });
    }
    static getInstance() {
        if (!Database.instance) {
            Database.instance = new Database();
        }
        return Database.instance;
    }
    getClient() {
        return this.prisma;
    }
    async connect() {
        await this.prisma.$connect();
    }
    async disconnect() {
        await this.prisma.$disconnect();
    }
    async clearAllData() {
        // Delete in reverse order of dependencies
        await this.prisma.syncStatus.deleteMany();
        await this.prisma.fileStatus.deleteMany();
        await this.prisma.message.deleteMany();
        await this.prisma.session.deleteMany();
        await this.prisma.project.deleteMany();
        await this.prisma.machine.deleteMany();
        await this.prisma.user.deleteMany();
    }
}
exports.db = Database.getInstance();
exports.prisma = exports.db.getClient();
//# sourceMappingURL=index.js.map