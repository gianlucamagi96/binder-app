import { IsString } from 'class-validator';

export class SelectActiveTcgDto {
  @IsString()
  code: string;
}
