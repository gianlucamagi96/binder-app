import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateSlotDto {
  @IsOptional()
  @IsString()
  tcgdexCardId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  condition?: string | null;
}
