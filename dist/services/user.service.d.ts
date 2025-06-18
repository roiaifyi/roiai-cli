import { UserInfo } from '../models/types';
export declare class UserService {
    private userInfo;
    loadUserInfo(): Promise<UserInfo>;
    private generateDefaultUserInfo;
    private ensureUserExists;
    getUserInfo(): UserInfo;
    getUserId(): string;
    getClientMachineId(): string;
    isAuthenticated(): boolean;
    getAuthenticatedUserId(): string | null;
    getAuthenticatedEmail(): string | null;
    getApiToken(): string | null;
    login(realUserId: string, email: string, apiToken: string): Promise<void>;
    logout(): Promise<void>;
}
//# sourceMappingURL=user.service.d.ts.map