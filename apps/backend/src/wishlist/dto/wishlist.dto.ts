import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWishlistDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

export class UpdateWishlistDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

export class AddWishlistItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  tcgdexCardId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
