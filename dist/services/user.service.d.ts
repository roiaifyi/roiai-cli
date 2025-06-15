import { UserInfo } from '../models/types';
export declare class UserService {
    private userInfo;
    loadUserInfo(): Promise<UserInfo>;
    private generateDefaultUserInfo;
    private ensureUserExists;
    getUserInfo(): UserInfo;
    getUserId(): string;
    getClientMachineId(): string;
}
//# sourceMappingURL=user.service.d.ts.map