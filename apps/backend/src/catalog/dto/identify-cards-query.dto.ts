import { IsOptional, IsString, MaxLength } from 'class-validator';

export class IdentifyCardsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  number?: string;
}
