import { IsIn, IsString, MinLength } from 'class-validator';

export class ChatApplyDto {
  @IsIn(['add', 'remove'])
  op: 'add' | 'remove';

  @IsIn(['binder', 'wishlist'])
  targetType: 'binder' | 'wishlist';

  @IsString()
  @MinLength(1)
  targetId: string;

  @IsString()
  @MinLength(1)
  cardId: string;
}
