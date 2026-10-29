import { IsId } from '../../../infrastructure/validation/decorators';
import { IsAmount, IsCurrency } from '../../validation';

export class ReserveDto {
  @IsId()
  public invoiceId!: string;

  @IsAmount(1)
  public amount!: number;

  @IsCurrency()
  public currency!: string;
}
