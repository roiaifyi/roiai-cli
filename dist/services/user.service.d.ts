import { UserInfo } from '../models/types';
export declare class UserService {
    private userInfo;
    private machineService;
    constructor();
    loadUserInfo(): Promise<UserInfo>;
    private generateDefaultUserInfo;
    private ensureUserExists;
    getUserInfo(): UserInfo;
    getUserId(): string;
    getAnonymousId(): string;
    getClientMachineId(): string;
    isAuthenticated(): boolean;
    getAuthenticatedUserId(): string | null;
    getAuthenticatedEmail(): string | null;
    getApiToken(): string | null;
    login(realUserId: string, email: string, apiKey: string, username?: string): Promise<void>;
    logout(): Promise<void>;
    private getUserInfoPath;
    private isStoredUserInfo;
}
//# sourceMappingURL=user.service.d.ts.map