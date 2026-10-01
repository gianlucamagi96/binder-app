import { IsString, Length } from 'class-validator';

export class GoogleExchangeDto {
  @IsString()
  @Length(64, 64)
  code: string;
}
