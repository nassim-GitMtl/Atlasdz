import { Injectable } from '@nestjs/common';

@Injectable()
export class ReadinessState {
  private draining = false;

  public isDraining(): boolean {
    return this.draining;
  }

  public beginDrain(): void {
    this.draining = true;
  }
}
