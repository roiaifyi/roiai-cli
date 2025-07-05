"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = exports.db = exports.getPrisma = exports.getDb = void 0;
const client_1 = require("@prisma/client");
const config_1 = require("../config");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
class Database {
    prisma;
    static instance;
    constructor() {
        let dbPath = config_1.configManager.getDatabaseConfig().path;
        // Handle tilde expansion
        if (dbPath.startsWith('~/')) {
            dbPath = path_1.default.join(os_1.default.homedir(), dbPath.slice(2));
        }
        // Ensure absolute path
        const absolutePath = path_1.default.isAbsolute(dbPath)
            ? dbPath
            : path_1.default.resolve(process.cwd(), dbPath);
        // Ensure directory exists
        const dbDir = path_1.default.dirname(absolutePath);
        if (!fs_1.default.existsSync(dbDir)) {
            fs_1.default.mkdirSync(dbDir, { recursive: true });
        }
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
    async ensureInitialized() {
        try {
            // Try to query the users table to check if database is initialized
            await this.prisma.user.findFirst();
        }
        catch (error) {
            if (error.message && error.message.includes('does not exist')) {
                // Tables don't exist, run migrations
                await this.runMigrationsAsync();
            }
            else {
                // Some other error, re-throw
                throw error;
            }
        }
    }
    async runMigrationsAsync() {
        try {
            console.log('Setting up database for first time use...');
            // Find the schema path relative to the package
            const schemaPath = path_1.default.join(__dirname, '../../prisma/schema.prisma');
            if (!fs_1.default.existsSync(schemaPath)) {
                throw new Error('Prisma schema not found');
            }
            // Get the absolute database path
            let dbPath = config_1.configManager.getDatabaseConfig().path;
            if (dbPath.startsWith('~/')) {
                dbPath = path_1.default.join(os_1.default.homedir(), dbPath.slice(2));
            }
            const absolutePath = path_1.default.isAbsolute(dbPath)
                ? dbPath
                : path_1.default.resolve(process.cwd(), dbPath);
            // Run migrations deploy (not dev) for production
            (0, child_process_1.execSync)(`npx --yes prisma migrate deploy --schema="${schemaPath}"`, {
                stdio: 'inherit',
                env: {
                    ...process.env,
                    DATABASE_URL: `file:${absolutePath}`
                }
            });
            console.log('✓ Database setup complete');
        }
        catch (error) {
            console.error('Failed to set up database:', error.message);
            throw error;
        }
    }
    async connect() {
        await this.prisma.$connect();
    }
    async disconnect() {
        await this.prisma.$disconnect();
    }
    async clearAllData() {
        // Delete in reverse order of dependencies
        await this.prisma.messageSyncStatus.deleteMany();
        await this.prisma.fileStatus.deleteMany();
        await this.prisma.message.deleteMany();
        await this.prisma.session.deleteMany();
        await this.prisma.project.deleteMany();
        await this.prisma.machine.deleteMany();
        await this.prisma.user.deleteMany();
    }
}
// Lazy initialization to avoid loading Prisma before it's generated
let _db = null;
let _prisma = null;
const getDb = () => {
    if (!_db) {
        _db = Database.getInstance();
    }
    return _db;
};
exports.getDb = getDb;
const getPrisma = () => {
    if (!_prisma) {
        _prisma = (0, exports.getDb)().getClient();
    }
    return _prisma;
};
exports.getPrisma = getPrisma;
// For backward compatibility
exports.db = new Proxy({}, {
    get(_, prop) {
        return (0, exports.getDb)()[prop];
    }
});
exports.prisma = new Proxy({}, {
    get(_, prop) {
        return (0, exports.getPrisma)()[prop];
    }
});
//# sourceMappingURL=index.js.map