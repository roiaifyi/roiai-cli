import ora, { Ora } from 'ora';
import { UserService } from '../services/user.service';
import { ErrorHandler } from '../utils/error-handler';

export abstract class CommandBase {
  protected userService: UserService;
  protected spinner?: Ora;

  constructor() {
    this.userService = new UserService();
  }

  protected async initializeServices(): Promise<void> {
    await this.userService.loadUserInfo();
  }

  protected createSpinner(text: string): Ora {
    this.spinner = ora(text).start();
    return this.spinner;
  }

  protected async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    spinnerText?: string
  ): Promise<T> {
    if (spinnerText) {
      this.createSpinner(spinnerText);
    }

    try {
      await this.initializeServices();
      return await operation();
    } catch (error) {
      ErrorHandler.handleCommandError(error, this.spinner);
    }
  }

  protected requireAuthentication(): void {
    if (!this.userService.isAuthenticated()) {
      throw ErrorHandler.createAuthenticationError();
    }
  }

  protected succeedSpinner(message: string): void {
    if (this.spinner) {
      this.spinner.succeed(message);
    }
  }

  protected failSpinner(message: string): void {
    if (this.spinner) {
      this.spinner.fail(message);
    }
  }

  protected stopSpinner(): void {
    if (this.spinner) {
      this.spinner.stop();
    }
  }
}