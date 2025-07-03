import ora, { Ora } from 'ora';
import { UserService } from '../services/user.service';
import { SpinnerErrorHandler } from '../utils/spinner-error-handler';

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
      if (this.spinner) {
        SpinnerErrorHandler.handleError(this.spinner, error, undefined, { exit: false });
      }
      throw error;
    }
  }

  protected requireAuthentication(): void {
    if (!this.userService.isAuthenticated()) {
      throw new Error('User is not authenticated. Please run `roiai cc login` first.');
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