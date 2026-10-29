import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { describeIdRule, isId } from '../../infrastructure/validation/decorators';

@Injectable()
export class ParseIdPipe implements PipeTransform<string, string> {
  public transform(value: string, metadata: ArgumentMetadata): string {
    if (!isId(value)) {
      throw new BadRequestException([describeIdRule(metadata.data ?? 'id')]);
    }
    return value;
  }
}
